import { describe, expect, it } from "vitest";

import {
  DEFAULT_SORT_DIR,
  DEFAULT_SORT_KEY,
  sortPositions,
  type SortableRow,
} from "./portfolio-sort";

/** Crea una fila con valores por defecto neutros; se sobreescribe lo relevante por test. */
function row(ticker: string, sortable: Partial<SortableRow> = {}) {
  const full: SortableRow = {
    ticker,
    name: null,
    broker: null,
    quantity: 0,
    avgPrice: 0,
    invested: 0,
    marketValue: 0,
    pnl: 0,
    ...sortable,
  };
  return { id: ticker, sortable: full };
}

const order = (rows: { id: string }[]) => rows.map((r) => r.id);

describe("sortPositions", () => {
  it("por defecto ordena por lo invertido de mayor a menor", () => {
    expect(DEFAULT_SORT_KEY).toBe("invested");
    expect(DEFAULT_SORT_DIR).toBe("desc");

    const rows = [
      row("A", { invested: 100 }),
      row("B", { invested: 300 }),
      row("C", { invested: 200 }),
    ];
    expect(order(sortPositions(rows, "invested", "desc"))).toEqual(["B", "C", "A"]);
  });

  it("el sentido ascendente invierte el orden", () => {
    const rows = [
      row("A", { invested: 100 }),
      row("B", { invested: 300 }),
      row("C", { invested: 200 }),
    ];
    expect(order(sortPositions(rows, "invested", "asc"))).toEqual(["A", "C", "B"]);
  });

  it("no muta la lista de entrada", () => {
    const rows = [row("A", { invested: 1 }), row("B", { invested: 2 })];
    const snapshot = order(rows);
    sortPositions(rows, "invested", "desc");
    expect(order(rows)).toEqual(snapshot);
  });

  it("los valores nulos van siempre al final, tanto en asc como en desc", () => {
    const rows = [
      row("A", { marketValue: null }),
      row("B", { marketValue: 50 }),
      row("C", { marketValue: 200 }),
    ];
    expect(order(sortPositions(rows, "marketValue", "desc"))).toEqual(["C", "B", "A"]);
    expect(order(sortPositions(rows, "marketValue", "asc"))).toEqual(["B", "C", "A"]);
  });

  it("ordena cadenas con localeCompare tolerante a acentos y con nulos al final", () => {
    const rows = [
      row("t1", { broker: "Ábaco" }),
      row("t2", { broker: "banco" }),
      row("t3", { broker: null }),
      row("t4", { broker: "Zeta" }),
    ];
    expect(order(sortPositions(rows, "broker", "asc"))).toEqual(["t1", "t2", "t4", "t3"]);
    // desc invierte los presentes pero deja el nulo al final.
    expect(order(sortPositions(rows, "broker", "desc"))).toEqual(["t4", "t2", "t1", "t3"]);
  });

  it("ordena el P&L por el número mostrado (positivos y negativos)", () => {
    const rows = [
      row("A", { pnl: -10 }),
      row("B", { pnl: 25 }),
      row("C", { pnl: 5 }),
    ];
    expect(order(sortPositions(rows, "pnl", "desc"))).toEqual(["B", "C", "A"]);
    expect(order(sortPositions(rows, "pnl", "asc"))).toEqual(["A", "C", "B"]);
  });

  it("desempata por ticker cuando el campo coincide (orden determinista)", () => {
    const rows = [
      row("ZZZ", { invested: 100 }),
      row("AAA", { invested: 100 }),
      row("MMM", { invested: 100 }),
    ];
    expect(order(sortPositions(rows, "invested", "desc"))).toEqual(["AAA", "MMM", "ZZZ"]);
    // El desempate por ticker es ascendente aunque el sentido sea desc.
    expect(order(sortPositions(rows, "invested", "asc"))).toEqual(["AAA", "MMM", "ZZZ"]);
  });

  it("ordena por cantidad con números crudos (sin conversión de divisa)", () => {
    const rows = [
      row("A", { quantity: 0.5 }),
      row("B", { quantity: 12 }),
      row("C", { quantity: 3 }),
    ];
    expect(order(sortPositions(rows, "quantity", "desc"))).toEqual(["B", "C", "A"]);
  });
});
