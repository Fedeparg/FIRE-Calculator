import { describe, expect, it } from "vitest";

import { estimateSavingsTax, type TradeLot } from "./plusvalias.js";
import type { ReferenceRates } from "./fx-reference.js";
import { buildRealisedGainsReport, referenceRatesNeeded, type RealisedGainsPosition } from "./realised-gains.js";

function lot(overrides: Partial<TradeLot> & Pick<TradeLot, "id">): TradeLot {
  return { kind: "buy", quantity: 1, price: 100, fees: 0, tradedAt: "2024-01-01", ...overrides };
}

function position(
  overrides: Partial<RealisedGainsPosition> & Pick<RealisedGainsPosition, "id" | "lots">,
): RealisedGainsPosition {
  return { ticker: overrides.id.toUpperCase(), name: null, currency: "EUR", ...overrides };
}

const buy = (id: string, quantity: number, price: number, tradedAt: string) => lot({ id, quantity, price, tradedAt });
const sell = (id: string, quantity: number, price: number, tradedAt: string) =>
  lot({ id, kind: "sell", quantity, price, tradedAt });

/** Informe sin tipos de referencia: basta para todo lo que es en euros. */
const build = (positions: RealisedGainsPosition[], rates: ReferenceRates = {}) =>
  buildRealisedGainsReport(positions, rates);

/** 1 EUR = `unitsPerEur` USD en cada fecha dada. */
const usd = (points: Record<string, number>): ReferenceRates => ({
  USD: Object.entries(points)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, unitsPerEur]) => ({ date, unitsPerEur })),
});

describe("buildRealisedGainsReport", () => {
  it("sin ventas, el informe está vacío", () => {
    expect(build([position({ id: "a", lots: [buy("1", 10, 5, "2024-01-01")] })]).years).toEqual([]);
    expect(build([]).years).toEqual([]);
  });

  it("agrupa por ejercicio, del más reciente al más antiguo", () => {
    const report = build([
      position({
        id: "a",
        lots: [buy("1", 10, 10, "2022-01-01"), sell("2", 2, 15, "2023-05-01"), sell("3", 2, 20, "2025-03-01")],
      }),
    ]);

    expect(report.years.map((y) => y.year)).toEqual([2025, 2023]);
    expect(report.years[0].net).toBe(20);
    expect(report.years[1].net).toBe(10);
  });

  it("compensa ganancias y pérdidas del mismo ejercicio y estima la cuota sobre el saldo", () => {
    const report = build([
      position({ id: "win", lots: [buy("1", 10, 10, "2024-01-01"), sell("2", 10, 20, "2024-06-01")] }),
      position({ id: "lose", lots: [buy("3", 10, 10, "2024-01-01"), sell("4", 10, 7, "2024-07-01")] }),
    ]);

    const [year] = report.years;
    expect(year.gains).toBe(100);
    expect(year.losses).toBe(-30);
    expect(year.net).toBe(70);
    expect(year.tax).toEqual(estimateSavingsTax(70));
    expect(year.rows.map((r) => [r.ticker, r.gain])).toEqual([
      ["LOSE", -30],
      ["WIN", 100],
    ]);
  });

  it("un ejercicio con pérdida neta da cuota 0 (no se arrastra)", () => {
    const report = build([
      position({ id: "a", lots: [buy("1", 10, 10, "2024-01-01"), sell("2", 10, 5, "2024-06-01")] }),
    ]);

    expect(report.years[0].net).toBe(-50);
    expect(report.years[0].tax?.tax).toBe(0);
  });

  it("deja fuera de los totales las ventas en divisa sin tipo del día de la venta", () => {
    const report = build([
      position({ id: "usd", currency: "USD", lots: [buy("1", 1, 100, "2024-01-01"), sell("2", 1, 300, "2024-02-01")] }),
      position({ id: "eur", lots: [buy("3", 1, 100, "2024-01-01"), sell("4", 1, 110, "2024-02-01")] }),
      position({ id: "gbp", currency: "GBP", lots: [buy("5", 1, 100, "2024-01-01"), sell("6", 1, 90, "2024-02-01")] }),
    ]);

    const [year] = report.years;
    expect(year.net).toBe(10);
    expect(year.unconverted).toEqual([
      { currency: "GBP", sales: 1, gain: -10 },
      { currency: "USD", sales: 1, gain: 200 },
    ]);
    expect(year.sales.filter((s) => s.eur === null).map((s) => s.positionId)).toEqual(["gbp", "usd"]);
    expect(year.tax).toEqual(estimateSavingsTax(10));
  });

  it("calcula la ganancia en divisa y la convierte al tipo del día de la venta (criterio DGT)", () => {
    // Ejemplo del plan: 10 acciones compradas por 1.500 USD + 1 USD de comisión con 1 EUR = 1,07 USD
    // y vendidas por 2.100 USD − 1 USD con 1 EUR = 1,0885 USD.
    const report = build(
      [
        position({
          id: "aapl",
          currency: "USD",
          lots: [
            lot({ id: "1", quantity: 10, price: 150, fees: 1, tradedAt: "2023-10-03" }),
            lot({ id: "2", kind: "sell", quantity: 10, price: 210, fees: 1, tradedAt: "2025-03-14" }),
          ],
        }),
      ],
      usd({ "2023-10-03": 1.07, "2025-03-14": 1.0885 }),
    );

    const [year] = report.years;
    const [sale] = year.sales;
    // Ganancia en USD: 2.099 − 1.501 = 598, a 1,0885.
    expect(sale.gain).toBeCloseTo(598, 9);
    expect(sale.eur?.gain).toBeCloseTo(598 / 1.0885, 9);
    expect(sale.eur?.transferValue).toBeCloseTo(2099 / 1.0885, 9);
    expect(sale.eur?.acquisitionValue).toBeCloseTo(1501 / 1.0885, 9);
    // Diferencia de cambio de los 1.501 USD invertidos: valen menos euros al vender.
    expect(sale.eur?.fxDifference).toBeCloseTo(1501 / 1.0885 - 1501 / 1.07, 9);
    expect(sale.eur?.sellRate).toEqual({ currency: "USD", unitsPerEur: 1.0885, date: "2025-03-14" });
    expect(sale.eur?.buyRates).toEqual([{ currency: "USD", unitsPerEur: 1.07, date: "2023-10-03" }]);
    // Juntas suman lo mismo que convertir cada operación a su fecha.
    expect(year.total).toBeCloseTo(2099 / 1.0885 - 1501 / 1.07, 9);
    expect(year.tax).toEqual(estimateSavingsTax(year.total));
  });

  it("sin el tipo de alguna compra, convierte la ganancia pero no la diferencia de cambio", () => {
    const report = build(
      [
        position({
          id: "usd",
          currency: "USD",
          lots: [buy("1", 1, 100, "2010-01-04"), buy("2", 1, 100, "2024-01-02"), sell("3", 2, 150, "2024-06-03")],
        }),
      ],
      usd({ "2024-01-02": 1.1, "2024-06-03": 1.08 }),
    );

    const [year] = report.years;
    expect(year.net).toBeCloseTo(100 / 1.08, 9);
    expect(year.sales[0].eur?.fxDifference).toBeNull();
    expect(year.sales[0].eur?.buyRates.map((r) => r?.date ?? null)).toEqual([null, "2024-01-02"]);
    expect(year.fxDifference).toBe(0);
    expect(year.fxIncomplete).toBe(1);
    expect(year.total).toBeCloseTo(year.net, 9);
  });

  it("en euros no hay diferencia de cambio ni hace falta serie", () => {
    const report = build([
      position({ id: "a", lots: [buy("1", 2, 10, "2024-01-01"), sell("2", 2, 12, "2024-03-01")] }),
    ]);
    const [sale] = report.years[0].sales;
    expect(sale.eur).toMatchObject({ gain: 4, fxDifference: 0, sellRate: { unitsPerEur: 1 } });
    expect(report.years[0].fxIncomplete).toBe(0);
  });

  it("usa el último tipo publicado si la venta cae en fin de semana", () => {
    const report = build(
      [
        position({
          id: "usd",
          currency: "USD",
          lots: [buy("1", 1, 100, "2024-01-02"), sell("2", 1, 120, "2024-06-08")],
        }),
      ],
      // 2024-06-08 es sábado: vale el del viernes 7.
      usd({ "2024-01-02": 1.1, "2024-06-07": 1.08, "2024-06-10": 1.5 }),
    );
    expect(report.years[0].sales[0].eur?.sellRate.date).toBe("2024-06-07");
  });

  it("suma varias ventas de la misma posición en una fila y conserva cada venta para el CSV", () => {
    const report = build([
      position({
        id: "a",
        name: "Fondo A",
        lots: [buy("1", 10, 10, "2024-01-01"), sell("2", 3, 12, "2024-03-01"), sell("3", 3, 14, "2024-09-01")],
      }),
    ]);

    const [year] = report.years;
    const [row] = year.rows;
    expect(row).toMatchObject({ ticker: "A", name: "Fondo A", sales: 2, quantity: 6, gain: 18 });
    expect(year.sales.map((s) => [s.lotId, s.tradedAt, s.gain])).toEqual([
      ["2", "2024-03-01", 6],
      ["3", "2024-09-01", 12],
    ]);
  });

  it("una posición vendida del todo sigue contando", () => {
    const report = build([
      position({ id: "a", lots: [buy("1", 5, 10, "2024-01-01"), sell("2", 5, 30, "2024-12-31")] }),
    ]);
    expect(report.years[0].net).toBe(100);
  });

  it("la venta del 31 de diciembre y la del 1 de enero van a ejercicios distintos", () => {
    const report = build([
      position({
        id: "a",
        lots: [buy("1", 2, 10, "2023-01-01"), sell("2", 1, 20, "2023-12-31"), sell("3", 1, 20, "2024-01-01")],
      }),
    ]);
    expect(report.years.map((y) => y.year)).toEqual([2024, 2023]);
  });

  it("aplica el FIFO al valor entero, aunque esté repartido en dos brókers", () => {
    // Compra en un bróker en 2020 a 50 y en otro en 2023 a 90; se vende en el segundo. Para
    // Hacienda sale primero la compra de 2020, esté donde esté.
    const report = build([
      position({ id: "degiro", ticker: "IWDA", lots: [buy("1", 10, 50, "2020-01-01")] }),
      position({
        id: "myinvestor",
        ticker: "iwda",
        lots: [buy("2", 10, 90, "2023-01-01"), sell("3", 5, 100, "2024-06-01")],
      }),
    ]);

    const [year] = report.years;
    expect(year.net).toBe(250);
    // La venta se atribuye a la posición donde se registró.
    expect(year.rows.map((r) => r.positionId)).toEqual(["myinvestor"]);
  });

  it("no empareja el mismo símbolo en divisas distintas", () => {
    const report = build([
      position({ id: "eur", ticker: "X", lots: [buy("1", 1, 10, "2020-01-01")] }),
      position({
        id: "usd",
        ticker: "X",
        currency: "USD",
        lots: [buy("2", 1, 50, "2021-01-01"), sell("3", 1, 60, "2024-01-01")],
      }),
    ]);
    expect(report.years[0].unconverted).toEqual([{ currency: "USD", sales: 1, gain: 10 }]);
  });
});

describe("referenceRatesNeeded", () => {
  it("pide las divisas con ventas desde su operación más antigua", () => {
    expect(
      referenceRatesNeeded([
        position({ id: "eur", lots: [buy("1", 1, 1, "2010-01-01"), sell("2", 1, 1, "2011-01-01")] }),
        position({ id: "usd", currency: "USD", lots: [buy("3", 1, 1, "2019-05-02"), sell("4", 1, 1, "2024-01-01")] }),
        position({ id: "chf", currency: "CHF", lots: [buy("5", 1, 1, "2015-01-01")] }),
        position({ id: "gbp", currency: "GBP", lots: [buy("6", 1, 1, "2021-03-01"), sell("7", 1, 1, "2022-01-01")] }),
      ]),
    ).toEqual({ currencies: ["GBP", "USD"], from: "2019-05-02" });
  });

  it("sin ventas en divisa no hace falta ningún tipo", () => {
    expect(
      referenceRatesNeeded([
        position({ id: "eur", lots: [buy("1", 1, 1, "2010-01-01"), sell("2", 1, 1, "2011-01-01")] }),
      ]),
    ).toBeNull();
    expect(referenceRatesNeeded([])).toBeNull();
  });
});
