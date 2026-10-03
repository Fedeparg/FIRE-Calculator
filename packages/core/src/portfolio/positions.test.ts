import { describe, expect, it } from "vitest";

import {
  countByFilter,
  dailyGain,
  dailyMovers,
  matchesQuery,
  positionFilterOf,
  valuePosition,
  type FilterablePosition,
} from "./positions.js";

// USD per unit: 1 EUR = 1.10 USD.
const RATES = { USD: 1, EUR: 1.1 };

describe("valuePosition", () => {
  it("values in the position's currency when the price is in the same one", () => {
    expect(
      valuePosition({ quantity: 10, avgPrice: 80, currency: "EUR" }, { close: 90, currency: "EUR" }, RATES),
    ).toEqual({
      invested: 800,
      marketValue: 900,
      pnlAbs: 100,
      pnlPct: 12.5,
    });
  });

  it("converts a price in another currency to the position's", () => {
    const result = valuePosition(
      { quantity: 1, avgPrice: 100, currency: "EUR" },
      { close: 110, currency: "USD" },
      RATES,
    );
    expect(result.marketValue).toBeCloseTo(100, 10);
    expect(result.pnlAbs).toBeCloseTo(0, 10);
  });

  it("leaves it unvalued without a price or when the rate is missing", () => {
    const position = { quantity: 1, avgPrice: 100, currency: "EUR" };
    expect(valuePosition(position, undefined, RATES)).toEqual({
      invested: 100,
      marketValue: null,
      pnlAbs: null,
      pnlPct: null,
    });
    expect(valuePosition(position, { close: 5, currency: "JPY" }, RATES).marketValue).toBeNull();
  });

  it("gives no percentage on a 0 investment (e.g. bonus shares)", () => {
    const result = valuePosition({ quantity: 3, avgPrice: 0, currency: "EUR" }, { close: 10, currency: "EUR" }, RATES);
    expect(result.pnlAbs).toBe(30);
    expect(result.pnlPct).toBeNull();
  });
});

const position = (overrides: Partial<FilterablePosition>): FilterablePosition => ({
  ticker: "VWCE.DE",
  name: "Vanguard FTSE All-World",
  broker: "Trade Republic",
  quantity: 10,
  isDerivative: false,
  ...overrides,
});

describe("positionFilterOf / countByFilter", () => {
  it("splits open, closed and derivatives; a closed derivative is still a derivative", () => {
    const list = [
      position({}),
      position({ quantity: 0 }),
      position({ isDerivative: true }),
      position({ isDerivative: true, quantity: 0 }),
    ];
    expect(list.map(positionFilterOf)).toEqual(["open", "closed", "derivatives", "derivatives"]);
    expect(countByFilter(list)).toEqual({ open: 1, closed: 1, derivatives: 2 });
  });

  it("counts zero in every group for an empty portfolio", () => {
    expect(countByFilter([])).toEqual({ open: 0, closed: 0, derivatives: 0 });
  });
});

describe("matchesQuery", () => {
  it("searches symbol, name and broker ignoring case and accents", () => {
    const p = position({ broker: "Bróker Ñandú" });
    expect(matchesQuery(p, "vwce")).toBe(true);
    expect(matchesQuery(p, "ALL-WORLD")).toBe(true);
    expect(matchesQuery(p, "broker nandu")).toBe(true);
    expect(matchesQuery(p, "apple")).toBe(false);
  });

  it("an empty or whitespace query matches everything, and null fields do not break it", () => {
    expect(matchesQuery(position({ name: null, broker: null }), "   ")).toBe(true);
    expect(matchesQuery(position({ name: null, broker: null }), "trade")).toBe(false);
  });
});

describe("dailyMovers", () => {
  const mover = (id: string, ticker: string, overrides: Partial<FilterablePosition> = {}) => ({
    ...position({ ticker, name: id, ...overrides }),
    id,
  });

  it("sorts by absolute change and honors the limit", () => {
    const moves = dailyMovers(
      [mover("A", "A"), mover("B", "B"), mover("C", "C")],
      {
        A: { close: 101, previousClose: 100 },
        B: { close: 95, previousClose: 100 },
        C: { close: 102, previousClose: 100 },
      },
      2,
    );
    expect(moves.map((m) => [m.id, Math.round(m.changePct)])).toEqual([
      ["B", -5],
      ["C", 2],
    ]);
  });

  it("leaves out closed positions, derivatives and prices without a valid previous close", () => {
    const moves = dailyMovers(
      [
        mover("closed", "X", { quantity: 0 }),
        mover("der", "Y", { isDerivative: true }),
        mover("first", "Z"),
        mover("zero", "W"),
      ],
      {
        X: { close: 2, previousClose: 1 },
        Y: { close: 2, previousClose: 1 },
        Z: { close: 2, previousClose: null },
        W: { close: 2, previousClose: 0 },
      },
      5,
    );
    expect(moves).toEqual([]);
  });
});

describe("dailyGain", () => {
  const holding = { quantity: 10, avgPrice: 80, currency: "EUR" };

  it("multiplies the quantity by the price move", () => {
    const gain = dailyGain(holding, { close: 102, previousClose: 100, currency: "EUR" }, RATES);
    expect(gain?.abs).toBeCloseTo(20, 10);
    expect(gain?.pct).toBeCloseTo(2, 10);
  });

  it("shows a loss with a negative sign", () => {
    const gain = dailyGain(holding, { close: 95, previousClose: 100, currency: "EUR" }, RATES);
    expect(gain?.abs).toBeCloseTo(-50, 10);
    expect(gain?.pct).toBeCloseTo(-5, 10);
  });

  it("converts to the position's currency when the price is quoted in another", () => {
    // 10 × 11 USD = 110 USD = 100 EUR.
    const gain = dailyGain(holding, { close: 111, previousClose: 100, currency: "USD" }, RATES);
    expect(gain?.abs).toBeCloseTo(100, 10);
  });

  it("returns null without a price, without a previous close or with a non-positive previous close", () => {
    expect(dailyGain(holding, undefined, RATES)).toBeNull();
    expect(dailyGain(holding, { close: 100, previousClose: null, currency: "EUR" }, RATES)).toBeNull();
    expect(dailyGain(holding, { close: 100, previousClose: 0, currency: "EUR" }, RATES)).toBeNull();
    expect(dailyGain(holding, { close: 100, previousClose: -1, currency: "EUR" }, RATES)).toBeNull();
  });

  it("returns null when the currency rate is missing", () => {
    expect(dailyGain(holding, { close: 101, previousClose: 100, currency: "JPY" }, RATES)).toBeNull();
  });

  it("returns null for a closed position and 0 when the price has not moved", () => {
    const price = { close: 100, previousClose: 100, currency: "EUR" };
    expect(dailyGain({ ...holding, quantity: 0 }, price, RATES)).toBeNull();
    expect(dailyGain(holding, price, RATES)).toEqual({ abs: 0, pct: 0 });
  });

  it("returns null for non-finite values", () => {
    expect(dailyGain(holding, { close: Number.NaN, previousClose: 100, currency: "EUR" }, RATES)).toBeNull();
  });
});
