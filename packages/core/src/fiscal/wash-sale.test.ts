import { describe, expect, it } from "vitest";

import type { TradeLot } from "./plusvalias.js";
import { computeWashSales } from "./wash-sale.js";

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

describe("computeWashSales", () => {
  // Worked example T.S.A. from the Manual práctico de Renta 2025 (ch. 11, "Pérdidas patrimoniales
  // que no se computan como tales"): 1,000 shares bought for €16,800 are sold for €12,000.
  const tsaOld = buy("old", "2015-05-25", 1000, 16_800);
  const tsaSale = sell("s1", "2025-07-16", 1000, 12_000);

  it("Manual case T.S.A.: the €4,800 loss is not included in 2025", () => {
    const result = computeWashSales([tsaOld, tsaSale, buy("re", "2025-08-16", 1000, 16_500)]);

    expect(result.get("s1")).toMatchObject({ deferredLoss: -4800, deferredQuantity: 1000, integratedLoss: 0 });
  });

  it("defers nothing without a repurchase", () => {
    expect(computeWashSales([tsaOld, tsaSale]).get("s1")?.deferredLoss).toBe(0);
  });

  it("later repurchase: the last day of the window (16/09) blocks and the next one (17/09) does not", () => {
    expect(computeWashSales([tsaOld, tsaSale, buy("re", "2025-09-16", 1000, 16_500)]).get("s1")?.deferredLoss).toBe(
      -4800,
    );
    expect(computeWashSales([tsaOld, tsaSale, buy("re", "2025-09-17", 1000, 16_500)]).get("s1")?.deferredLoss).toBe(0);
  });

  it("earlier repurchase: the first day of the window (16/05) blocks and the day before (15/05) does not", () => {
    // FIFO sells the 2015 lot; the repurchased one stays in the portfolio.
    expect(computeWashSales([tsaOld, buy("re", "2025-05-16", 1000, 16_500), tsaSale]).get("s1")?.deferredLoss).toBe(
      -4800,
    );
    expect(computeWashSales([tsaOld, buy("re", "2025-05-15", 1000, 16_500), tsaSale]).get("s1")?.deferredLoss).toBe(0);
  });

  it("partial repurchase: only the proportional part is deferred", () => {
    const sale = computeWashSales([tsaOld, tsaSale, buy("re", "2025-08-01", 250, 4000)]).get("s1");

    expect(sale?.deferredQuantity).toBe(250);
    expect(sale?.deferredLoss).toBeCloseTo(-1200, 9);
  });

  it("repurchasing more than was sold defers no more than the loss", () => {
    expect(computeWashSales([tsaOld, tsaSale, buy("re", "2025-08-01", 5000, 80_000)]).get("s1")?.deferredLoss).toBe(
      -4800,
    );
  });

  it("an earlier purchase sold in the same transaction does not block", () => {
    const result = computeWashSales([
      tsaOld,
      buy("re", "2025-06-20", 1000, 16_500),
      sell("s", "2025-07-16", 2000, 24_000),
    ]);

    expect(result.get("s")?.deferredLoss).toBe(0);
  });

  it("a sale at a gain defers nothing even if repurchased", () => {
    const result = computeWashSales([tsaOld, sell("s", "2025-07-16", 1000, 20_000), buy("re", "2025-08-01", 1000, 1)]);

    expect(result.get("s")?.deferredLoss).toBe(0);
  });

  it("only the FIFO chunks of the sale that carry a loss are deferred", () => {
    const result = computeWashSales([
      buy("cheap", "2020-01-01", 100, 1000), // €10/share: a gain at 12
      buy("dear", "2021-01-01", 100, 2000), // €20/share: a loss of 800
      sell("s", "2025-07-16", 200, 2400),
      buy("re", "2025-08-01", 100, 1100),
    ]);

    expect(result.get("s")).toMatchObject({ deferredQuantity: 100, deferredLoss: -800 });
  });

  it("the deferred loss is included when the repurchased shares are sold", () => {
    const result = computeWashSales([
      tsaOld,
      tsaSale,
      buy("re", "2025-08-16", 1000, 16_500),
      sell("s2", "2026-03-01", 1000, 15_000),
    ]);

    expect(result.get("s2")?.integratedLoss).toBeCloseTo(-4800, 9);
    expect(result.get("s2")?.integratedFrom).toEqual([{ fromSaleId: "s1", loss: expect.closeTo(-4800, 9) }]);
    // s2's own loss (€1,500) is not deferred: there are no purchases in its window.
    expect(result.get("s2")?.deferredLoss).toBe(0);
  });

  it("selling the repurchased shares is not final if they are bought back again: the loss stays deferred until the final sale", () => {
    const result = computeWashSales([
      tsaOld,
      tsaSale,
      buy("re", "2025-08-16", 1000, 16_500),
      sell("s2", "2026-03-01", 1000, 20_000),
      buy("re2", "2026-04-01", 1000, 20_000),
      sell("s3", "2027-01-01", 1000, 20_000),
    ]);

    expect(result.get("s2")?.integratedLoss).toBe(0);
    expect(result.get("s3")?.integratedLoss).toBeCloseTo(-4800, 9);
    expect(result.get("s3")?.integratedFrom).toEqual([{ fromSaleId: "s1", loss: expect.closeTo(-4800, 9) }]);
  });

  it("the inclusion is proportional to the shares sold", () => {
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

  it("a purchased share blocks only once: several sales are matched in chronological order", () => {
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

  it("bonus issues (ampliaciones liberadas) do not count as a repurchase", () => {
    const result = computeWashSales([
      tsaOld,
      tsaSale,
      { id: "bonus", kind: "buy", quantity: 100, price: 0, fees: 0, tradedAt: "2025-06-01" },
    ]);

    expect(result.get("s1")?.deferredLoss).toBe(0);
  });

  it("returns one entry per sale, including those with no effect", () => {
    const result = computeWashSales([tsaOld, tsaSale]);

    expect([...result.keys()]).toEqual(["s1"]);
    expect(result.get("s1")?.integratedFrom).toEqual([]);
  });
});
