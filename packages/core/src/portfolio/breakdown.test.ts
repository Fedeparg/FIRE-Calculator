import { describe, expect, it } from "vitest";

import { buildBreakdown, type BreakdownInput } from "./breakdown.js";
import { itemAt } from "../arrays.js";

type Position = BreakdownInput["positions"][number];

function position(overrides: Partial<Position> & Pick<Position, "ticker">): Position {
  return {
    name: null,
    quantity: 1,
    broker: null,
    currency: "EUR",
    ...overrides,
  };
}

/** EUR and USD convertible; GBP deliberately missing to test the exclusion. */
const RATES = { USD: 1, EUR: 1.1 };

const BASE = {
  rates: RATES,
  display: "EUR",
  unknownBrokerLabel: "No broker",
} as const;

describe("buildBreakdown", () => {
  it("groups by asset and computes the weight of each one", () => {
    const result = buildBreakdown({
      ...BASE,
      groupBy: "asset",
      positions: [
        position({ ticker: "VWCE", name: "Vanguard All-World", quantity: 10 }),
        position({ ticker: "SXR8", quantity: 10 }),
      ],
      prices: {
        VWCE: { close: 90, currency: "EUR" },
        SXR8: { close: 30, currency: "EUR" },
      },
    });

    expect(result.total).toBe(1200);
    expect(result.slices.map((s) => [s.label, s.value, Math.round(s.share)])).toEqual([
      ["Vanguard All-World", 900, 75],
      ["SXR8", 300, 25],
    ]);
    expect(result.included).toBe(2);
    expect(result.excluded).toBe(0);
  });

  it("uses the ticker as the label when the position has no name", () => {
    const result = buildBreakdown({
      ...BASE,
      groupBy: "asset",
      positions: [position({ ticker: "AAPL", name: "   " })],
      prices: { AAPL: { close: 100, currency: "EUR" } },
    });

    expect(itemAt(result.slices, 0).label).toBe("AAPL");
  });

  it("sums the same asset held at different brokers into a single group", () => {
    const result = buildBreakdown({
      ...BASE,
      groupBy: "asset",
      positions: [
        position({ ticker: "VWCE", quantity: 5, broker: "MyInvestor" }),
        position({ ticker: "VWCE", quantity: 5, broker: "IBKR" }),
      ],
      prices: { VWCE: { close: 100, currency: "EUR" } },
    });

    expect(result.slices).toHaveLength(1);
    expect(itemAt(result.slices, 0).value).toBe(1000);
    expect(itemAt(result.slices, 0).positions).toBe(2);
  });

  it("excludes, like aggregatePortfolio, a position whose currency cannot be converted", () => {
    // Price in EUR (convertible) but position in GBP (no rate): the Summary total leaves it out,
    // so the breakdown does too, or the weights would not add up.
    const result = buildBreakdown({
      ...BASE,
      groupBy: "asset",
      positions: [position({ ticker: "A", currency: "GBP" }), position({ ticker: "B" })],
      prices: { A: { close: 100, currency: "EUR" }, B: { close: 100, currency: "EUR" } },
    });

    expect(result.total).toBe(100);
    expect(result.excluded).toBe(1);
    expect(result.slices.map((s) => s.key)).toEqual(["B"]);
  });

  it("groups by broker and labels positions without a broker", () => {
    const result = buildBreakdown({
      ...BASE,
      groupBy: "broker",
      positions: [
        position({ ticker: "A", quantity: 1, broker: "MyInvestor" }),
        position({ ticker: "B", quantity: 1, broker: "  " }),
      ],
      prices: {
        A: { close: 300, currency: "EUR" },
        B: { close: 100, currency: "EUR" },
      },
    });

    expect(result.slices.map((s) => s.label)).toEqual(["MyInvestor", "No broker"]);
    expect(itemAt(result.slices, 1).value).toBe(100);
  });

  it("groups by the position's currency, not the price's", () => {
    const result = buildBreakdown({
      ...BASE,
      groupBy: "currency",
      // Bought in EUR but quoted in USD: counts as EUR.
      positions: [position({ ticker: "AAPL", quantity: 1, currency: "EUR" })],
      prices: { AAPL: { close: 110, currency: "USD" } },
    });

    expect(result.slices).toHaveLength(1);
    expect(itemAt(result.slices, 0).label).toBe("EUR");
    // 110 USD → 100 EUR with rates(EUR) = 1.1 USD/EUR.
    expect(itemAt(result.slices, 0).value).toBeCloseTo(100, 10);
  });

  it("excludes positions without a price", () => {
    const result = buildBreakdown({
      ...BASE,
      groupBy: "asset",
      positions: [position({ ticker: "A", quantity: 1 }), position({ ticker: "B", quantity: 1 })],
      prices: { A: { close: 100, currency: "EUR" } },
    });

    expect(result.included).toBe(1);
    expect(result.excluded).toBe(1);
    expect(result.total).toBe(100);
  });

  it("excludes positions whose price currency is not convertible", () => {
    const result = buildBreakdown({
      ...BASE,
      groupBy: "asset",
      positions: [position({ ticker: "A", quantity: 1 }), position({ ticker: "B", quantity: 1 })],
      prices: {
        A: { close: 100, currency: "EUR" },
        // GBP is not in `rates`: there is no honest way to convert it.
        B: { close: 100, currency: "GBP" },
      },
    });

    expect(result.included).toBe(1);
    expect(result.excluded).toBe(1);
    expect(result.slices).toHaveLength(1);
  });

  it("a portfolio with nothing valuable returns an empty breakdown, not zero-valued slices", () => {
    const result = buildBreakdown({
      ...BASE,
      groupBy: "asset",
      positions: [position({ ticker: "A" })],
      prices: {},
    });

    expect(result.slices).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.excluded).toBe(1);
  });

  it("weights add up to 100% when there is something to split", () => {
    const result = buildBreakdown({
      ...BASE,
      groupBy: "asset",
      positions: [
        position({ ticker: "A", quantity: 3 }),
        position({ ticker: "B", quantity: 5 }),
        position({ ticker: "C", quantity: 7 }),
      ],
      prices: {
        A: { close: 11, currency: "EUR" },
        B: { close: 13, currency: "EUR" },
        C: { close: 17, currency: "EUR" },
      },
    });

    expect(result.slices.reduce((sum, s) => sum + s.share, 0)).toBeCloseTo(100, 10);
  });

  it("sorts from largest to smallest and breaks ties by label", () => {
    const result = buildBreakdown({
      ...BASE,
      groupBy: "asset",
      positions: [
        position({ ticker: "Z", quantity: 1 }),
        position({ ticker: "A", quantity: 1 }),
        position({ ticker: "M", quantity: 2 }),
      ],
      prices: {
        Z: { close: 100, currency: "EUR" },
        A: { close: 100, currency: "EUR" },
        M: { close: 100, currency: "EUR" },
      },
    });

    expect(result.slices.map((s) => s.label)).toEqual(["M", "A", "Z"]);
  });

  it("discards a non-finite value instead of polluting the total", () => {
    const result = buildBreakdown({
      ...BASE,
      groupBy: "asset",
      positions: [
        position({ ticker: "A", quantity: Number.POSITIVE_INFINITY }),
        position({ ticker: "B", quantity: 1 }),
      ],
      prices: {
        A: { close: 100, currency: "EUR" },
        B: { close: 100, currency: "EUR" },
      },
    });

    expect(result.total).toBe(100);
    expect(result.excluded).toBe(1);
  });
});
