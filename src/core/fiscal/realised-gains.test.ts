import { describe, expect, it } from "vitest";

import { estimateSavingsTax, type TradeLot } from "./plusvalias";
import { buildRealisedGainsReport, type RealisedGainsPosition } from "./realised-gains";

function lot(overrides: Partial<TradeLot> & Pick<TradeLot, "id">): TradeLot {
  return { kind: "buy", quantity: 1, price: 100, fees: 0, tradedAt: "2024-01-01", ...overrides };
}

function position(overrides: Partial<RealisedGainsPosition> & Pick<RealisedGainsPosition, "id" | "lots">): RealisedGainsPosition {
  return { ticker: overrides.id.toUpperCase(), name: null, currency: "EUR", ...overrides };
}

const buy = (id: string, quantity: number, price: number, tradedAt: string) => lot({ id, quantity, price, tradedAt });
const sell = (id: string, quantity: number, price: number, tradedAt: string) => lot({ id, kind: "sell", quantity, price, tradedAt });

describe("buildRealisedGainsReport", () => {
  it("sin ventas, el informe está vacío", () => {
    expect(buildRealisedGainsReport([position({ id: "a", lots: [buy("1", 10, 5, "2024-01-01")] })]).years).toEqual([]);
    expect(buildRealisedGainsReport([]).years).toEqual([]);
  });

  it("agrupa por ejercicio, del más reciente al más antiguo", () => {
    const report = buildRealisedGainsReport([
      position({
        id: "a",
        lots: [buy("1", 10, 10, "2022-01-01"), sell("2", 2, 15, "2023-05-01"), sell("3", 2, 20, "2025-03-01")],
      }),
    ]);

    expect(report.years.map((y) => y.year)).toEqual([2025, 2023]);
    expect(report.years[0].groups[0].net).toBe(20);
    expect(report.years[1].groups[0].net).toBe(10);
  });

  it("compensa ganancias y pérdidas del mismo ejercicio y estima la cuota sobre el saldo", () => {
    const report = buildRealisedGainsReport([
      position({ id: "win", lots: [buy("1", 10, 10, "2024-01-01"), sell("2", 10, 20, "2024-06-01")] }),
      position({ id: "lose", lots: [buy("3", 10, 10, "2024-01-01"), sell("4", 10, 7, "2024-07-01")] }),
    ]);

    const [year] = report.years;
    const [eur] = year.groups;
    expect(eur.gains).toBe(100);
    expect(eur.losses).toBe(-30);
    expect(eur.net).toBe(70);
    expect(year.tax).toEqual(estimateSavingsTax(70));
    expect(eur.rows.map((r) => [r.ticker, r.gain])).toEqual([
      ["LOSE", -30],
      ["WIN", 100],
    ]);
  });

  it("un ejercicio con pérdida neta da cuota 0 (no se arrastra)", () => {
    const report = buildRealisedGainsReport([
      position({ id: "a", lots: [buy("1", 10, 10, "2024-01-01"), sell("2", 10, 5, "2024-06-01")] }),
    ]);

    expect(report.years[0].groups[0].net).toBe(-50);
    expect(report.years[0].tax?.tax).toBe(0);
  });

  it("separa las divisas, pone el euro primero y solo estima la cuota en euros", () => {
    const report = buildRealisedGainsReport([
      position({ id: "usd", currency: "USD", lots: [buy("1", 1, 100, "2024-01-01"), sell("2", 1, 300, "2024-02-01")] }),
      position({ id: "eur", lots: [buy("3", 1, 100, "2024-01-01"), sell("4", 1, 110, "2024-02-01")] }),
      position({ id: "gbp", currency: "GBP", lots: [buy("5", 1, 100, "2024-01-01"), sell("6", 1, 90, "2024-02-01")] }),
    ]);

    const [year] = report.years;
    expect(year.groups.map((g) => [g.currency, g.net])).toEqual([
      ["EUR", 10],
      ["GBP", -10],
      ["USD", 200],
    ]);
    expect(year.tax).toEqual(estimateSavingsTax(10));
  });

  it("sin ventas en euros no estima cuota", () => {
    const report = buildRealisedGainsReport([
      position({ id: "usd", currency: "USD", lots: [buy("1", 1, 100, "2024-01-01"), sell("2", 1, 300, "2024-02-01")] }),
    ]);
    expect(report.years[0].tax).toBeNull();
  });

  it("suma varias ventas de la misma posición en una fila y conserva cada venta para el CSV", () => {
    const report = buildRealisedGainsReport([
      position({
        id: "a",
        name: "Fondo A",
        lots: [buy("1", 10, 10, "2024-01-01"), sell("2", 3, 12, "2024-03-01"), sell("3", 3, 14, "2024-09-01")],
      }),
    ]);

    const [year] = report.years;
    const [row] = year.groups[0].rows;
    expect(row).toMatchObject({ ticker: "A", name: "Fondo A", sales: 2, quantity: 6, gain: 18 });
    expect(year.sales.map((s) => [s.lotId, s.tradedAt, s.gain])).toEqual([
      ["2", "2024-03-01", 6],
      ["3", "2024-09-01", 12],
    ]);
  });

  it("una posición vendida del todo sigue contando", () => {
    const report = buildRealisedGainsReport([
      position({ id: "a", lots: [buy("1", 5, 10, "2024-01-01"), sell("2", 5, 30, "2024-12-31")] }),
    ]);
    expect(report.years[0].groups[0].net).toBe(100);
  });

  it("la venta del 31 de diciembre y la del 1 de enero van a ejercicios distintos", () => {
    const report = buildRealisedGainsReport([
      position({
        id: "a",
        lots: [buy("1", 2, 10, "2023-01-01"), sell("2", 1, 20, "2023-12-31"), sell("3", 1, 20, "2024-01-01")],
      }),
    ]);
    expect(report.years.map((y) => y.year)).toEqual([2024, 2023]);
  });
});
