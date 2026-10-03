import { describe, expect, it } from "vitest";

import { DEFAULT_SORT_DIR, DEFAULT_SORT_KEY, sortPositions, type SortableRow } from "./sort";

/** Builds a row with neutral defaults; each test overrides what matters. */
function row(ticker: string, sortable: Partial<SortableRow> = {}) {
  const full: SortableRow = {
    ticker,
    name: null,
    invested: 0,
    marketValue: 0,
    pnl: 0,
    ...sortable,
  };
  return { id: ticker, sortable: full };
}

const order = (rows: { id: string }[]) => rows.map((r) => r.id);

describe("sortPositions", () => {
  it("by default sorts by amount invested, highest first", () => {
    expect(DEFAULT_SORT_KEY).toBe("invested");
    expect(DEFAULT_SORT_DIR).toBe("desc");

    const rows = [row("A", { invested: 100 }), row("B", { invested: 300 }), row("C", { invested: 200 })];
    expect(order(sortPositions(rows, "invested", "desc"))).toEqual(["B", "C", "A"]);
  });

  it("ascending direction reverses the order", () => {
    const rows = [row("A", { invested: 100 }), row("B", { invested: 300 }), row("C", { invested: 200 })];
    expect(order(sortPositions(rows, "invested", "asc"))).toEqual(["A", "C", "B"]);
  });

  it("does not mutate the input list", () => {
    const rows = [row("A", { invested: 1 }), row("B", { invested: 2 })];
    const snapshot = order(rows);
    sortPositions(rows, "invested", "desc");
    expect(order(rows)).toEqual(snapshot);
  });

  it("null values always go last, in both asc and desc", () => {
    const rows = [row("A", { marketValue: null }), row("B", { marketValue: 50 }), row("C", { marketValue: 200 })];
    expect(order(sortPositions(rows, "marketValue", "desc"))).toEqual(["C", "B", "A"]);
    expect(order(sortPositions(rows, "marketValue", "asc"))).toEqual(["B", "C", "A"]);
  });

  it("sorts strings with accent-insensitive localeCompare and nulls last", () => {
    const rows = [
      row("t1", { name: "Ábaco" }),
      row("t2", { name: "banco" }),
      row("t3", { name: null }),
      row("t4", { name: "Zeta" }),
    ];
    expect(order(sortPositions(rows, "name", "asc"))).toEqual(["t1", "t2", "t4", "t3"]);
    // desc reverses the present values but keeps the null last.
    expect(order(sortPositions(rows, "name", "desc"))).toEqual(["t4", "t2", "t1", "t3"]);
  });

  it("sorts P&L by the displayed number (positive and negative)", () => {
    const rows = [row("A", { pnl: -10 }), row("B", { pnl: 25 }), row("C", { pnl: 5 })];
    expect(order(sortPositions(rows, "pnl", "desc"))).toEqual(["B", "C", "A"]);
    expect(order(sortPositions(rows, "pnl", "asc"))).toEqual(["A", "C", "B"]);
  });

  it("breaks ties by ticker when the field matches (deterministic order)", () => {
    const rows = [row("ZZZ", { invested: 100 }), row("AAA", { invested: 100 }), row("MMM", { invested: 100 })];
    expect(order(sortPositions(rows, "invested", "desc"))).toEqual(["AAA", "MMM", "ZZZ"]);
    // The ticker tie-break is ascending even when the direction is desc.
    expect(order(sortPositions(rows, "invested", "asc"))).toEqual(["AAA", "MMM", "ZZZ"]);
  });
});
