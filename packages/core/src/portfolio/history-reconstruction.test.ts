import { describe, expect, it } from "vitest";

import {
  firstTradeDate,
  MAX_CARRY_FORWARD_DAYS,
  reconstructHistory,
  type HistoryInput,
  type HistoryLot,
  type HistoryPosition,
  type PricePoint,
} from "./history-reconstruction.js";

const buy = (tradedAt: string, quantity: number, price: number): HistoryLot => ({
  kind: "buy",
  quantity,
  price,
  tradedAt,
});
const sell = (tradedAt: string, quantity: number, price: number): HistoryLot => ({
  kind: "sell",
  quantity,
  price,
  tradedAt,
});

const position = (ticker: string, lots: HistoryLot[], currency = "EUR"): HistoryPosition => ({
  ticker,
  currency,
  isDerivative: false,
  lots,
});

/** Serie de cierres diarios (todos los días naturales) empezando en `from`. */
function daily(from: string, closes: number[], currency = "EUR"): PricePoint[] {
  return closes.map((close, i) => ({
    date: new Date(Date.parse(`${from}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10),
    close,
    currency,
  }));
}

function input(overrides: Partial<HistoryInput>): HistoryInput {
  return { positions: [], prices: {}, fx: {}, from: "2026-01-01", to: "2026-01-10", display: "EUR", ...overrides };
}

describe("reconstructHistory", () => {
  it("devuelve vacío con la cartera vacía o con from > to", () => {
    expect(reconstructHistory(input({}))).toEqual([]);
    expect(
      reconstructHistory(
        input({
          positions: [position("A", [buy("2026-01-01", 1, 10)])],
          prices: { A: daily("2026-01-01", [10]) },
          from: "2026-01-05",
          to: "2026-01-01",
        }),
      ),
    ).toEqual([]);
  });

  it("no inventa historia: antes de la primera compra no hay snapshot", () => {
    const days = reconstructHistory(
      input({
        positions: [position("A", [buy("2026-01-04", 10, 100)])],
        prices: { A: daily("2026-01-01", [100, 101, 102, 103, 104, 105, 106, 107, 108, 109]) },
      }),
    );
    expect(days[0].date).toBe("2026-01-04");
    expect(days).toHaveLength(7);
    // El día de la compra se valora con el cierre de ese día.
    expect(days[0].aggregate.marketValue).toBe(10 * 103);
    expect(days[0].aggregate.invested).toBe(1000);
  });

  it("usa la cantidad de cada día, no la actual (compra, segunda compra y venta parcial)", () => {
    const days = reconstructHistory(
      input({
        positions: [
          position("A", [buy("2026-01-01", 10, 100), buy("2026-01-03", 10, 120), sell("2026-01-05", 5, 130)]),
        ],
        prices: { A: daily("2026-01-01", Array<number>(10).fill(100)) },
      }),
    );
    const byDate = Object.fromEntries(days.map((d) => [d.date, d.aggregate]));
    expect(byDate["2026-01-02"].marketValue).toBe(1000); // 10 uds
    expect(byDate["2026-01-03"].marketValue).toBe(2000); // 20 uds
    expect(byDate["2026-01-03"].invested).toBe(2200); // 10·100 + 10·120
    expect(byDate["2026-01-05"].marketValue).toBe(1500); // 15 uds tras vender 5
    // Coste medio móvil: la venta retira al medio (110) y el medio no cambia.
    expect(byDate["2026-01-05"].invested).toBeCloseTo(15 * 110, 8);
  });

  it("compra y venta total en el periodo: desaparece tras vender y reaparece al recomprar", () => {
    const days = reconstructHistory(
      input({
        positions: [position("A", [buy("2026-01-02", 10, 100), sell("2026-01-04", 10, 110), buy("2026-01-07", 4, 90)])],
        prices: { A: daily("2026-01-01", Array<number>(10).fill(100)) },
      }),
    );
    expect(days.map((d) => d.date)).toEqual([
      "2026-01-02",
      "2026-01-03",
      // 04, 05 y 06: todo vendido, nada que valorar
      "2026-01-07",
      "2026-01-08",
      "2026-01-09",
      "2026-01-10",
    ]);
    // Tras vender todo el coste arranca de cero: la recompra no hereda el medio anterior.
    expect(days[2].aggregate.invested).toBe(360);
  });

  it("tolera vender más de lo que hay (se acota a cero, sin cantidades negativas)", () => {
    const days = reconstructHistory(
      input({
        positions: [position("A", [buy("2026-01-01", 1, 10), sell("2026-01-02", 5, 10)])],
        prices: { A: daily("2026-01-01", Array<number>(10).fill(10)) },
      }),
    );
    expect(days.map((d) => d.date)).toEqual(["2026-01-01"]);
  });

  it("respeta el orden de los lotes del mismo día (vender y recomprar)", () => {
    const days = reconstructHistory(
      input({
        positions: [position("A", [buy("2026-01-01", 10, 100), sell("2026-01-02", 10, 100), buy("2026-01-02", 5, 50)])],
        prices: { A: daily("2026-01-01", Array<number>(10).fill(60)) },
      }),
    );
    // Vender todo y recomprar 5@50 deja coste 250; en el orden inverso se habría vendido de más.
    expect(days[1].aggregate.invested).toBe(250);
    expect(days[1].aggregate.marketValue).toBe(300);
  });

  it("arrastra el último cierre en fines de semana y festivos", () => {
    const days = reconstructHistory(
      input({
        positions: [position("A", [buy("2026-01-01", 2, 10)])],
        prices: {
          A: [
            { date: "2026-01-01", close: 10, currency: "EUR" },
            { date: "2026-01-05", close: 12, currency: "EUR" },
          ],
        },
      }),
    );
    const byDate = Object.fromEntries(days.map((d) => [d.date, d.aggregate.marketValue]));
    expect(byDate["2026-01-03"]).toBe(20); // sigue valiendo el cierre del día 1
    expect(byDate["2026-01-05"]).toBe(24);
  });

  it("salta los días sin precio cuando el último cierre es más viejo que el margen", () => {
    const days = reconstructHistory(
      input({
        positions: [position("A", [buy("2026-01-01", 1, 10)])],
        prices: { A: [{ date: "2026-01-01", close: 10, currency: "EUR" }] },
        from: "2026-01-01",
        to: "2026-02-01",
      }),
    );
    expect(MAX_CARRY_FORWARD_DAYS).toBe(10);
    expect(days.at(-1)?.date).toBe("2026-01-11"); // 1 ene + MAX_CARRY_FORWARD_DAYS
  });

  it("una posición sin ningún precio queda sin valorar, sin tirar abajo el resto", () => {
    const days = reconstructHistory(
      input({
        positions: [position("A", [buy("2026-01-01", 1, 10)]), position("B", [buy("2026-01-01", 1, 10)])],
        prices: { A: daily("2026-01-01", Array<number>(10).fill(10)) },
      }),
    );
    expect(days[0].aggregate.valued).toBe(1);
    expect(days[0].aggregate.total).toBe(2);
  });

  it("convierte con la tasa FX de CADA día y omite el día sin tasa", () => {
    const days = reconstructHistory(
      input({
        positions: [position("US", [buy("2026-01-01", 10, 100)], "USD")],
        prices: { US: daily("2026-01-01", Array<number>(10).fill(100), "USD") },
        // USD por EUR: 1,10 desde el día 2 y 1,20 desde el día 3.
        fx: {
          EUR: [
            { date: "2026-01-02", rate: 1.1 },
            { date: "2026-01-03", rate: 1.2 },
          ],
        },
      }),
    );
    expect(days[0].date).toBe("2026-01-02"); // el día 1 no hay tasa EUR: no se valora
    expect(days[0].aggregate.marketValue).toBeCloseTo(1000 / 1.1, 8);
    expect(days[1].aggregate.marketValue).toBeCloseTo(1000 / 1.2, 8);
    expect(days[1].rates).toEqual({ USD: 1, EUR: 1.2 });
  });

  it("ignora tasas no válidas (cero, NaN) y excluye los derivados del total", () => {
    const days = reconstructHistory(
      input({
        positions: [
          { ...position("D", [buy("2026-01-01", 1, 10)]), isDerivative: true },
          position("A", [buy("2026-01-01", 1, 10)]),
        ],
        prices: { D: daily("2026-01-01", [10]), A: daily("2026-01-01", Array<number>(10).fill(10)) },
        fx: { EUR: [{ date: "2026-01-01", rate: Number.NaN }] },
      }),
    );
    expect(days[0].rates).toEqual({ USD: 1 });
    expect(days[0].aggregate.total).toBe(1);
  });

  it("procesa los lotes anteriores a `from` en el primer día de la ventana", () => {
    const days = reconstructHistory(
      input({
        positions: [position("A", [buy("2025-12-20", 3, 10)])],
        prices: { A: daily("2026-01-01", Array<number>(10).fill(10)) },
        from: "2026-01-05",
      }),
    );
    expect(days[0].date).toBe("2026-01-05");
    expect(days[0].aggregate.marketValue).toBe(30);
  });

  it("ignora los lotes posteriores a `to`", () => {
    const days = reconstructHistory(
      input({
        positions: [position("A", [buy("2026-02-01", 3, 10)])],
        prices: { A: daily("2026-01-01", Array<number>(10).fill(10)) },
      }),
    );
    expect(days).toEqual([]);
  });
});

describe("reconstructHistory con splits", () => {
  it("un split 10:1 no produce salto: la cantidad cruda se expresa en acciones de hoy", () => {
    // 10 acciones compradas a 1000 € antes del split del día 5. La fuente da los cierres ya
    // ajustados (100 € todos los días): sin corrección, valdría 1.000 € antes y 10.000 € después.
    const days = reconstructHistory(
      input({
        positions: [position("A", [buy("2026-01-01", 10, 1000)])],
        prices: { A: daily("2026-01-01", Array<number>(10).fill(100)) },
        splits: { A: [{ date: "2026-01-05", ratio: 10 }] },
      }),
    );
    expect(days.map((d) => d.aggregate.marketValue)).toEqual(Array<number>(10).fill(10_000));
    // El coste no cambia (10 · 1000).
    expect(days.every((d) => d.aggregate.invested === 10_000)).toBe(true);
  });

  it("solo cuentan los splits posteriores al lote; los lotes posteriores al split no se tocan", () => {
    const days = reconstructHistory(
      input({
        positions: [position("A", [buy("2026-01-01", 10, 1000), buy("2026-01-06", 5, 100)])],
        prices: { A: daily("2026-01-01", Array<number>(10).fill(100)) },
        splits: { A: [{ date: "2026-01-05", ratio: 10 }] },
      }),
    );
    expect(days[0].aggregate.marketValue).toBe(10_000);
    expect(days[5].aggregate.marketValue).toBe(10_000 + 500);
    // Coste medio móvil coherente: 10·1000 + 5·100.
    expect(days[5].aggregate.invested).toBe(10_500);
  });

  it("encadena varios splits y un split inverso", () => {
    const days = reconstructHistory(
      input({
        positions: [position("A", [buy("2026-01-01", 100, 10)])],
        prices: { A: daily("2026-01-01", Array<number>(10).fill(10)) },
        splits: {
          A: [
            { date: "2026-01-03", ratio: 2 },
            { date: "2026-01-04", ratio: 0.5 },
            { date: "2026-01-06", ratio: 3 },
          ],
        },
      }),
    );
    expect(days[0].aggregate.marketValue).toBe(100 * 3 * 10);
  });

  it("un split del mismo día de la compra no afecta a ese lote", () => {
    const days = reconstructHistory(
      input({
        positions: [position("A", [buy("2026-01-05", 10, 100)])],
        prices: { A: daily("2026-01-01", Array<number>(10).fill(100)) },
        splits: { A: [{ date: "2026-01-05", ratio: 10 }] },
      }),
    );
    expect(days[0].aggregate.marketValue).toBe(1000);
  });
});

describe("firstTradeDate", () => {
  it("devuelve la operación más antigua entre todas las posiciones", () => {
    expect(
      firstTradeDate([
        position("A", [buy("2025-03-01", 1, 1), buy("2025-01-15", 1, 1)]),
        position("B", [buy("2024-11-30", 1, 1)]),
      ]),
    ).toBe("2024-11-30");
  });

  it("devuelve null sin operaciones", () => {
    expect(firstTradeDate([])).toBeNull();
    expect(firstTradeDate([position("A", [])])).toBeNull();
  });
});
