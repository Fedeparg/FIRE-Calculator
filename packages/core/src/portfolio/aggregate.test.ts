import { describe, expect, it } from "vitest";

import { aggregatePortfolio, valueInDisplay } from "./aggregate.js";

// USD per unit: 1 EUR = 1.10 USD; 1 GBP = 1.25 USD; USD = 1.
const RATES = { USD: 1, EUR: 1.1, GBP: 1.25 };

describe("valueInDisplay", () => {
  it("converts cost and value from their currencies, or null if a rate is missing", () => {
    const position = { quantity: 2, avgPrice: 50, currency: "EUR" };
    const valued = valueInDisplay(position, { close: 66, currency: "USD" }, RATES, "EUR");
    expect(valued?.invested).toBeCloseTo(100, 6);
    expect(valued?.marketValue).toBeCloseTo(120, 6);
    expect(valueInDisplay(position, { close: 66, currency: "JPY" }, RATES, "EUR")).toBeNull();
    expect(valueInDisplay({ ...position, currency: "JPY" }, { close: 66, currency: "USD" }, RATES, "EUR")).toBeNull();
  });
});

describe("aggregatePortfolio", () => {
  const display = "EUR";

  it("aggregates positions converting each amount to the chosen currency", () => {
    const result = aggregatePortfolio({
      display,
      rates: RATES,
      positions: [
        { ticker: "EUNL.DE", quantity: 10, avgPrice: 80, currency: "EUR", isDerivative: false }, // cost €800
        { ticker: "AAPL", quantity: 5, avgPrice: 100, currency: "USD", isDerivative: false }, // cost $500 → €500/1.1
      ],
      prices: {
        "EUNL.DE": { close: 90, currency: "EUR" }, // value €900
        AAPL: { close: 120, currency: "USD" }, // value $600 → €600/1.1
      },
    });

    const investedAapl = 500 / 1.1;
    const valueAapl = 600 / 1.1;
    expect(result.valued).toBe(2);
    expect(result.total).toBe(2);
    expect(result.invested).toBeCloseTo(800 + investedAapl, 6);
    expect(result.marketValue).toBeCloseTo(900 + valueAapl, 6);
    expect(result.pnlAbs).toBeCloseTo(result.marketValue - result.invested, 6);
    expect(result.pnlPct).toBeCloseTo((result.pnlAbs / result.invested) * 100, 6);
  });

  it("converts via FX a position whose price is quoted in a currency other than its cost", () => {
    // Cost declared in EUR (what was paid), but the instrument is quoted in USD.
    const result = aggregatePortfolio({
      display, // EUR
      rates: RATES,
      positions: [{ ticker: "BTC-USD", quantity: 1, avgPrice: 50_000, currency: "EUR", isDerivative: false }],
      prices: { "BTC-USD": { close: 60_000, currency: "USD" } },
    });

    // Invested: €50,000 (already in display). Value: $60,000 → €60,000/1.1.
    expect(result.valued).toBe(1);
    expect(result.invested).toBeCloseTo(50_000, 6);
    expect(result.marketValue).toBeCloseTo(60_000 / 1.1, 6);
    expect(result.pnlAbs).toBeCloseTo(60_000 / 1.1 - 50_000, 6);
  });

  it("excludes positions without a price (but those in another currency ARE included, converted)", () => {
    const result = aggregatePortfolio({
      display,
      rates: RATES,
      positions: [
        { ticker: "EUNL.DE", quantity: 10, avgPrice: 80, currency: "EUR", isDerivative: false }, // valued
        { ticker: "NOPRICE", quantity: 1, avgPrice: 10, currency: "EUR", isDerivative: false }, // no price → excluded
        { ticker: "USDPRICE", quantity: 1, avgPrice: 10, currency: "EUR", isDerivative: false }, // USD price → included
      ],
      prices: {
        "EUNL.DE": { close: 90, currency: "EUR" },
        USDPRICE: { close: 12, currency: "USD" },
      },
    });

    expect(result.valued).toBe(2);
    expect(result.total).toBe(3);
    // Invested: €800 + €10 = €810. Value: €900 + $12/1.1.
    expect(result.invested).toBeCloseTo(810, 6);
    expect(result.marketValue).toBeCloseTo(900 + 12 / 1.1, 6);
  });

  it("excludes positions whose currency is not convertible (no rate)", () => {
    const result = aggregatePortfolio({
      display,
      rates: RATES,
      positions: [{ ticker: "TYO", quantity: 1, avgPrice: 100, currency: "JPY", isDerivative: false }],
      prices: { TYO: { close: 120, currency: "JPY" } },
    });

    expect(result.valued).toBe(0);
    expect(result.invested).toBe(0);
    expect(result.pnlPct).toBeNull();
  });

  it("leaves pnlPct null when the invested amount is 0", () => {
    const result = aggregatePortfolio({
      display,
      rates: RATES,
      positions: [{ ticker: "A", quantity: 0, avgPrice: 0, currency: "EUR", isDerivative: false }],
      prices: { A: { close: 100, currency: "EUR" } },
    });

    expect(result.invested).toBe(0);
    expect(result.pnlPct).toBeNull();
  });

  it("keeps derivatives out of the total, even when they have a price", () => {
    const result = aggregatePortfolio({
      display,
      rates: RATES,
      positions: [
        { ticker: "EUNL.DE", quantity: 10, avgPrice: 80, currency: "EUR", isDerivative: false },
        { ticker: "KO1", quantity: 100, avgPrice: 1, currency: "EUR", isDerivative: true },
      ],
      prices: { "EUNL.DE": { close: 90, currency: "EUR" }, KO1: { close: 0.1, currency: "EUR" } },
    });

    expect(result.invested).toBeCloseTo(800, 6);
    expect(result.marketValue).toBeCloseTo(900, 6);
    expect(result.valued).toBe(1);
    expect(result.total).toBe(1);
  });
});
