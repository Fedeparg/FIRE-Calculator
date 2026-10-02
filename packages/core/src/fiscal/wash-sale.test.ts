import { describe, expect, it } from "vitest";

import type { TradeLot } from "./plusvalias.js";
import { addMonths, computeWashSales } from "./wash-sale.js";

const buy = (id: string, tradedAt: string, quantity: number, total: number): TradeLot => ({
  id,
  kind: "buy",
  quantity,
  price: total / quantity,
  fees: 0,
  tradedAt,
});

const sell = (id: string, tradedAt: string, quantity: number, total: number): TradeLot => ({
  id,
  kind: "sell",
  quantity,
  price: total / quantity,
  fees: 0,
  tradedAt,
});

describe("addMonths", () => {
  it("cuenta de fecha a fecha", () => {
    expect(addMonths("2025-07-16", 2)).toBe("2025-09-16");
    expect(addMonths("2025-07-16", -2)).toBe("2025-05-16");
  });

  it("cruza años", () => {
    expect(addMonths("2025-11-30", 2)).toBe("2026-01-30");
    expect(addMonths("2025-01-15", -2)).toBe("2024-11-15");
  });

  it("toma el último día del mes cuando el destino no tiene ese día", () => {
    expect(addMonths("2025-12-31", 2)).toBe("2026-02-28");
    expect(addMonths("2023-12-31", 2)).toBe("2024-02-29");
    expect(addMonths("2025-10-31", -2)).toBe("2025-08-31");
    expect(addMonths("2025-04-30", -2)).toBe("2025-02-28");
  });
});

describe("computeWashSales", () => {
  // Caso práctico T.S.A. del Manual práctico de Renta 2025 (cap. 11, «Pérdidas patrimoniales que
  // no se computan como tales»): 1.000 acciones compradas por 16.800 € se venden por 12.000 €.
  const tsaOld = buy("old", "2015-05-25", 1000, 16_800);
  const tsaSale = sell("s1", "2025-07-16", 1000, 12_000);

  it("caso T.S.A. del Manual: la pérdida de 4.800 € no se integra en 2025", () => {
    const result = computeWashSales([tsaOld, tsaSale, buy("re", "2025-08-16", 1000, 16_500)]);

    expect(result.get("s1")).toMatchObject({ deferredLoss: -4800, deferredQuantity: 1000, integratedLoss: 0 });
  });

  it("sin recompra no se difiere nada", () => {
    expect(computeWashSales([tsaOld, tsaSale]).get("s1")?.deferredLoss).toBe(0);
  });

  it("recompra posterior: el último día de la ventana (16/09) bloquea y el siguiente (17/09) no", () => {
    expect(computeWashSales([tsaOld, tsaSale, buy("re", "2025-09-16", 1000, 16_500)]).get("s1")?.deferredLoss).toBe(
      -4800,
    );
    expect(computeWashSales([tsaOld, tsaSale, buy("re", "2025-09-17", 1000, 16_500)]).get("s1")?.deferredLoss).toBe(0);
  });

  it("recompra anterior: el primer día de la ventana (16/05) bloquea y el anterior (15/05) no", () => {
    // El FIFO vende el lote de 2015; el recomprado sigue en cartera.
    expect(computeWashSales([tsaOld, buy("re", "2025-05-16", 1000, 16_500), tsaSale]).get("s1")?.deferredLoss).toBe(
      -4800,
    );
    expect(computeWashSales([tsaOld, buy("re", "2025-05-15", 1000, 16_500), tsaSale]).get("s1")?.deferredLoss).toBe(0);
  });

  it("recompra parcial: solo se difiere la parte proporcional", () => {
    const sale = computeWashSales([tsaOld, tsaSale, buy("re", "2025-08-01", 250, 4000)]).get("s1");

    expect(sale?.deferredQuantity).toBe(250);
    expect(sale?.deferredLoss).toBeCloseTo(-1200, 9);
  });

  it("recomprar más de lo vendido no difiere más que la pérdida", () => {
    expect(computeWashSales([tsaOld, tsaSale, buy("re", "2025-08-01", 5000, 80_000)]).get("s1")?.deferredLoss).toBe(
      -4800,
    );
  });

  it("la compra anterior que se vende en la misma operación no bloquea", () => {
    const result = computeWashSales([
      tsaOld,
      buy("re", "2025-06-20", 1000, 16_500),
      sell("s", "2025-07-16", 2000, 24_000),
    ]);

    expect(result.get("s")?.deferredLoss).toBe(0);
  });

  it("una venta con ganancia no difiere nada aunque se recompre", () => {
    const result = computeWashSales([tsaOld, sell("s", "2025-07-16", 1000, 20_000), buy("re", "2025-08-01", 1000, 1)]);

    expect(result.get("s")?.deferredLoss).toBe(0);
  });

  it("solo se difieren los trozos FIFO con pérdida de la venta", () => {
    const result = computeWashSales([
      buy("cheap", "2020-01-01", 100, 1000), // 10 €/título: ganancia a 12
      buy("dear", "2021-01-01", 100, 2000), // 20 €/título: pérdida de 800
      sell("s", "2025-07-16", 200, 2400),
      buy("re", "2025-08-01", 100, 1100),
    ]);

    expect(result.get("s")).toMatchObject({ deferredQuantity: 100, deferredLoss: -800 });
  });

  it("la pérdida diferida se integra al vender los títulos recomprados", () => {
    const result = computeWashSales([
      tsaOld,
      tsaSale,
      buy("re", "2025-08-16", 1000, 16_500),
      sell("s2", "2026-03-01", 1000, 15_000),
    ]);

    expect(result.get("s2")?.integratedLoss).toBeCloseTo(-4800, 9);
    expect(result.get("s2")?.integratedFrom).toEqual([{ fromSaleId: "s1", loss: expect.closeTo(-4800, 9) }]);
    // La pérdida propia de s2 (1.500 €) no se difiere: no hay compras en su ventana.
    expect(result.get("s2")?.deferredLoss).toBe(0);
  });

  it("la integración es proporcional a los títulos vendidos", () => {
    const result = computeWashSales([
      tsaOld,
      tsaSale,
      buy("re", "2025-08-16", 1000, 16_500),
      sell("s2", "2026-03-01", 400, 6000),
      sell("s3", "2026-06-01", 600, 9000),
    ]);

    expect(result.get("s2")?.integratedLoss).toBeCloseTo(-1920, 9);
    expect(result.get("s3")?.integratedLoss).toBeCloseTo(-2880, 9);
  });

  it("un título comprado solo bloquea una vez: varias ventas se atienden por orden cronológico", () => {
    const result = computeWashSales([
      buy("a", "2020-01-01", 200, 4000),
      sell("s1", "2025-07-01", 100, 1000),
      sell("s2", "2025-07-10", 100, 1000),
      buy("re", "2025-07-20", 100, 1000),
    ]);

    expect(result.get("s1")?.deferredQuantity).toBe(100);
    expect(result.get("s1")?.deferredLoss).toBe(-1000);
    expect(result.get("s2")?.deferredLoss).toBe(0);
  });

  it("las ampliaciones liberadas no cuentan como recompra", () => {
    const result = computeWashSales([
      tsaOld,
      tsaSale,
      { id: "bonus", kind: "buy", quantity: 100, price: 0, fees: 0, tradedAt: "2025-06-01" },
    ]);

    expect(result.get("s1")?.deferredLoss).toBe(0);
  });

  it("devuelve una entrada por venta, también sin efecto", () => {
    const result = computeWashSales([tsaOld, tsaSale]);

    expect([...result.keys()]).toEqual(["s1"]);
    expect(result.get("s1")?.integratedFrom).toEqual([]);
  });
});
