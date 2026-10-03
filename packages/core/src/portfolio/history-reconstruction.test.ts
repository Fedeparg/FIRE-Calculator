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
import { itemAt } from "../arrays.js";

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

/** Series of daily closes (every calendar day) starting at `from`. */
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
  it("returns empty for an empty portfolio or when from > to", () => {
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

  it("invents no history: there is no snapshot before the first buy", () => {
    const days = reconstructHistory(
      input({
        positions: [position("A", [buy("2026-01-04", 10, 100)])],
        prices: { A: daily("2026-01-01", [100, 101, 102, 103, 104, 105, 106, 107, 108, 109]) },
      }),
    );
    expect(itemAt(days, 0).date).toBe("2026-01-04");
    expect(days).toHaveLength(7);
    // The buy day is valued at that day's close.
    expect(itemAt(days, 0).aggregate.marketValue).toBe(10 * 103);
    expect(itemAt(days, 0).aggregate.invested).toBe(1000);
  });

  it("uses each day's quantity, not the current one (buy, second buy and partial sale)", () => {
    const days = reconstructHistory(
      input({
        positions: [
          position("A", [buy("2026-01-01", 10, 100), buy("2026-01-03", 10, 120), sell("2026-01-05", 5, 130)]),
        ],
        prices: { A: daily("2026-01-01", Array<number>(10).fill(100)) },
      }),
    );
    const byDate = Object.fromEntries(days.map((d) => [d.date, d.aggregate]));
    expect(byDate["2026-01-02"]?.marketValue).toBe(1000); // 10 units
    expect(byDate["2026-01-03"]?.marketValue).toBe(2000); // 20 units
    expect(byDate["2026-01-03"]?.invested).toBe(2200); // 10·100 + 10·120
    expect(byDate["2026-01-05"]?.marketValue).toBe(1500); // 15 units after selling 5
    // Moving average cost: the sale removes at the average (110) and the average does not change.
    expect(byDate["2026-01-05"]?.invested).toBeCloseTo(15 * 110, 8);
  });

  it("full buy and sell within the period: disappears after selling and reappears on rebuying", () => {
    const days = reconstructHistory(
      input({
        positions: [position("A", [buy("2026-01-02", 10, 100), sell("2026-01-04", 10, 110), buy("2026-01-07", 4, 90)])],
        prices: { A: daily("2026-01-01", Array<number>(10).fill(100)) },
      }),
    );
    expect(days.map((d) => d.date)).toEqual([
      "2026-01-02",
      "2026-01-03",
      // 04, 05 and 06: all sold, nothing to value
      "2026-01-07",
      "2026-01-08",
      "2026-01-09",
      "2026-01-10",
    ]);
    // After selling everything the cost restarts at zero: the rebuy does not inherit the previous average.
    expect(itemAt(days, 2).aggregate.invested).toBe(360);
  });

  it("tolerates selling more than is held (clamped to zero, no negative quantities)", () => {
    const days = reconstructHistory(
      input({
        positions: [position("A", [buy("2026-01-01", 1, 10), sell("2026-01-02", 5, 10)])],
        prices: { A: daily("2026-01-01", Array<number>(10).fill(10)) },
      }),
    );
    expect(days.map((d) => d.date)).toEqual(["2026-01-01"]);
  });

  it("respects the order of same-day lots (sell then rebuy)", () => {
    const days = reconstructHistory(
      input({
        positions: [position("A", [buy("2026-01-01", 10, 100), sell("2026-01-02", 10, 100), buy("2026-01-02", 5, 50)])],
        prices: { A: daily("2026-01-01", Array<number>(10).fill(60)) },
      }),
    );
    // Selling everything and rebuying 5@50 leaves a cost of 250; in the reverse order it would have oversold.
    expect(itemAt(days, 1).aggregate.invested).toBe(250);
    expect(itemAt(days, 1).aggregate.marketValue).toBe(300);
  });

  it("carries the last close forward over weekends and holidays", () => {
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
    expect(byDate["2026-01-03"]).toBe(20); // still at the close of day 1
    expect(byDate["2026-01-05"]).toBe(24);
  });

  it("skips days without a price when the last close is older than the margin", () => {
    const days = reconstructHistory(
      input({
        positions: [position("A", [buy("2026-01-01", 1, 10)])],
        prices: { A: [{ date: "2026-01-01", close: 10, currency: "EUR" }] },
        from: "2026-01-01",
        to: "2026-02-01",
      }),
    );
    expect(MAX_CARRY_FORWARD_DAYS).toBe(10);
    expect(days.at(-1)?.date).toBe("2026-01-11"); // 1 Jan + MAX_CARRY_FORWARD_DAYS
  });

  it("a position with no price at all stays unvalued without bringing down the rest", () => {
    const days = reconstructHistory(
      input({
        positions: [position("A", [buy("2026-01-01", 1, 10)]), position("B", [buy("2026-01-01", 1, 10)])],
        prices: { A: daily("2026-01-01", Array<number>(10).fill(10)) },
      }),
    );
    expect(itemAt(days, 0).aggregate.valued).toBe(1);
    expect(itemAt(days, 0).aggregate.total).toBe(2);
  });

  it("converts with EACH day's FX rate and skips the day without a rate", () => {
    const days = reconstructHistory(
      input({
        positions: [position("US", [buy("2026-01-01", 10, 100)], "USD")],
        prices: { US: daily("2026-01-01", Array<number>(10).fill(100), "USD") },
        // USD per EUR: 1.10 from day 2 and 1.20 from day 3.
        fx: {
          EUR: [
            { date: "2026-01-02", rate: 1.1 },
            { date: "2026-01-03", rate: 1.2 },
          ],
        },
      }),
    );
    expect(itemAt(days, 0).date).toBe("2026-01-02"); // day 1 has no EUR rate: not valued
    expect(itemAt(days, 0).aggregate.marketValue).toBeCloseTo(1000 / 1.1, 8);
    expect(itemAt(days, 1).aggregate.marketValue).toBeCloseTo(1000 / 1.2, 8);
    expect(itemAt(days, 1).rates).toEqual({ USD: 1, EUR: 1.2 });
  });

  it("ignores invalid rates (zero, NaN) and excludes derivatives from the total", () => {
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
    expect(itemAt(days, 0).rates).toEqual({ USD: 1 });
    expect(itemAt(days, 0).aggregate.total).toBe(1);
  });

  it("processes lots before `from` on the first day of the window", () => {
    const days = reconstructHistory(
      input({
        positions: [position("A", [buy("2025-12-20", 3, 10)])],
        prices: { A: daily("2026-01-01", Array<number>(10).fill(10)) },
        from: "2026-01-05",
      }),
    );
    expect(itemAt(days, 0).date).toBe("2026-01-05");
    expect(itemAt(days, 0).aggregate.marketValue).toBe(30);
  });

  it("ignores lots after `to`", () => {
    const days = reconstructHistory(
      input({
        positions: [position("A", [buy("2026-02-01", 3, 10)])],
        prices: { A: daily("2026-01-01", Array<number>(10).fill(10)) },
      }),
    );
    expect(days).toEqual([]);
  });
});

describe("reconstructHistory with splits", () => {
  it("a 10:1 split causes no jump: the raw quantity is expressed in today's shares", () => {
    // 10 shares bought at €1000 before the split on day 5. The source returns already adjusted
    // closes (€100 every day): without the correction it would be worth €1,000 before and €10,000 after.
    const days = reconstructHistory(
      input({
        positions: [position("A", [buy("2026-01-01", 10, 1000)])],
        prices: { A: daily("2026-01-01", Array<number>(10).fill(100)) },
        splits: { A: [{ date: "2026-01-05", ratio: 10 }] },
      }),
    );
    expect(days.map((d) => d.aggregate.marketValue)).toEqual(Array<number>(10).fill(10_000));
    // The cost does not change (10 · 1000).
    expect(days.every((d) => d.aggregate.invested === 10_000)).toBe(true);
  });

  it("only splits after the lot count; lots after the split are left untouched", () => {
    const days = reconstructHistory(
      input({
        positions: [position("A", [buy("2026-01-01", 10, 1000), buy("2026-01-06", 5, 100)])],
        prices: { A: daily("2026-01-01", Array<number>(10).fill(100)) },
        splits: { A: [{ date: "2026-01-05", ratio: 10 }] },
      }),
    );
    expect(itemAt(days, 0).aggregate.marketValue).toBe(10_000);
    expect(itemAt(days, 5).aggregate.marketValue).toBe(10_000 + 500);
    // Consistent moving average cost: 10·1000 + 5·100.
    expect(itemAt(days, 5).aggregate.invested).toBe(10_500);
  });

  it("chains several splits and a reverse split", () => {
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
    expect(itemAt(days, 0).aggregate.marketValue).toBe(100 * 3 * 10);
  });

  it("a split on the same day as the buy does not affect that lot", () => {
    const days = reconstructHistory(
      input({
        positions: [position("A", [buy("2026-01-05", 10, 100)])],
        prices: { A: daily("2026-01-01", Array<number>(10).fill(100)) },
        splits: { A: [{ date: "2026-01-05", ratio: 10 }] },
      }),
    );
    expect(itemAt(days, 0).aggregate.marketValue).toBe(1000);
  });
});

describe("firstTradeDate", () => {
  it("returns the oldest trade across all positions", () => {
    expect(
      firstTradeDate([
        position("A", [buy("2025-03-01", 1, 1), buy("2025-01-15", 1, 1)]),
        position("B", [buy("2024-11-30", 1, 1)]),
      ]),
    ).toBe("2024-11-30");
  });

  it("returns null without trades", () => {
    expect(firstTradeDate([])).toBeNull();
    expect(firstTradeDate([position("A", [])])).toBeNull();
  });
});
