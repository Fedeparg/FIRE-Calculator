import { describe, expect, it } from "vitest";

import { aggregatePortfolio, convertCurrency } from "./fx";

// USD por unidad: 1 EUR = 1,10 USD; 1 GBP = 1,25 USD; USD = 1.
const RATES = { USD: 1, EUR: 1.1, GBP: 1.25 };

describe("convertCurrency", () => {
  it("devuelve el mismo importe cuando origen y destino coinciden", () => {
    expect(convertCurrency(100, "EUR", "EUR", RATES)).toBe(100);
  });

  it("convierte A→B pivotando por USD", () => {
    // 100 EUR → USD = 110; USD → GBP = 110 / 1,25 = 88.
    expect(convertCurrency(100, "EUR", "GBP", RATES)).toBeCloseTo(88, 6);
    // 100 EUR → USD = 110.
    expect(convertCurrency(100, "EUR", "USD", RATES)).toBeCloseTo(110, 6);
  });

  it("devuelve null si falta la tasa de origen o destino", () => {
    expect(convertCurrency(100, "JPY", "EUR", RATES)).toBeNull();
    expect(convertCurrency(100, "EUR", "JPY", RATES)).toBeNull();
  });

  it("trata una tasa 0 como no convertible (evita dividir por cero)", () => {
    expect(convertCurrency(100, "EUR", "GBP", { ...RATES, GBP: 0 })).toBeNull();
  });
});

describe("aggregatePortfolio", () => {
  const display = "EUR";

  it("agrega solo posiciones con precio en la misma divisa, convirtiendo a la divisa elegida", () => {
    const result = aggregatePortfolio({
      display,
      rates: RATES,
      positions: [
        { ticker: "EUNL.DE", quantity: 10, avgPrice: 80, currency: "EUR" }, // coste 800 €
        { ticker: "AAPL", quantity: 5, avgPrice: 100, currency: "USD" }, // coste 500 $ → 500/1,1 €
      ],
      prices: {
        "EUNL.DE": { close: 90, currency: "EUR" }, // valor 900 €
        AAPL: { close: 120, currency: "USD" }, // valor 600 $ → 600/1,1 €
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

  it("excluye posiciones sin precio o con divisa del precio distinta a la de la posición", () => {
    const result = aggregatePortfolio({
      display,
      rates: RATES,
      positions: [
        { ticker: "EUNL.DE", quantity: 10, avgPrice: 80, currency: "EUR" }, // valorada
        { ticker: "NOPRICE", quantity: 1, avgPrice: 10, currency: "EUR" }, // sin precio
        { ticker: "MISMATCH", quantity: 1, avgPrice: 10, currency: "EUR" }, // precio en USD
      ],
      prices: {
        "EUNL.DE": { close: 90, currency: "EUR" },
        MISMATCH: { close: 12, currency: "USD" },
      },
    });

    expect(result.valued).toBe(1);
    expect(result.total).toBe(3);
    expect(result.invested).toBeCloseTo(800, 6);
    expect(result.marketValue).toBeCloseTo(900, 6);
  });

  it("excluye posiciones cuya divisa no es convertible (sin tasa)", () => {
    const result = aggregatePortfolio({
      display,
      rates: RATES,
      positions: [{ ticker: "TYO", quantity: 1, avgPrice: 100, currency: "JPY" }],
      prices: { TYO: { close: 120, currency: "JPY" } },
    });

    expect(result.valued).toBe(0);
    expect(result.invested).toBe(0);
    expect(result.pnlPct).toBeNull();
  });
});
