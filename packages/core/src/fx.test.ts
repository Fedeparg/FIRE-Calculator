import { describe, expect, it } from "vitest";

import { aggregatePortfolio, convertCurrency } from "./fx.js";

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

  it("devuelve null ante una tasa no finita (no inventa números)", () => {
    expect(convertCurrency(100, "EUR", "USD", { ...RATES, USD: Number.NaN })).toBeNull();
    expect(convertCurrency(100, "EUR", "USD", { ...RATES, EUR: Number.POSITIVE_INFINITY })).toBeNull();
  });
});

describe("aggregatePortfolio", () => {
  const display = "EUR";

  it("agrega posiciones convirtiendo cada importe a la divisa elegida", () => {
    const result = aggregatePortfolio({
      display,
      rates: RATES,
      positions: [
        { ticker: "EUNL.DE", quantity: 10, avgPrice: 80, currency: "EUR", isDerivative: false }, // coste 800 €
        { ticker: "AAPL", quantity: 5, avgPrice: 100, currency: "USD", isDerivative: false }, // coste 500 $ → 500/1,1 €
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

  it("convierte vía FX una posición cuyo precio cotiza en otra divisa que la del coste", () => {
    // Coste declarado en EUR (lo que se pagó), pero el instrumento cotiza en USD.
    const result = aggregatePortfolio({
      display, // EUR
      rates: RATES,
      positions: [{ ticker: "BTC-USD", quantity: 1, avgPrice: 50_000, currency: "EUR", isDerivative: false }],
      prices: { "BTC-USD": { close: 60_000, currency: "USD" } },
    });

    // Invertido: 50 000 € (ya en display). Valor: 60 000 $ → 60 000/1,1 €.
    expect(result.valued).toBe(1);
    expect(result.invested).toBeCloseTo(50_000, 6);
    expect(result.marketValue).toBeCloseTo(60_000 / 1.1, 6);
    expect(result.pnlAbs).toBeCloseTo(60_000 / 1.1 - 50_000, 6);
  });

  it("excluye posiciones sin precio (pero las de divisa distinta SÍ entran, convertidas)", () => {
    const result = aggregatePortfolio({
      display,
      rates: RATES,
      positions: [
        { ticker: "EUNL.DE", quantity: 10, avgPrice: 80, currency: "EUR", isDerivative: false }, // valorada
        { ticker: "NOPRICE", quantity: 1, avgPrice: 10, currency: "EUR", isDerivative: false }, // sin precio → fuera
        { ticker: "USDPRICE", quantity: 1, avgPrice: 10, currency: "EUR", isDerivative: false }, // precio en USD → dentro
      ],
      prices: {
        "EUNL.DE": { close: 90, currency: "EUR" },
        USDPRICE: { close: 12, currency: "USD" },
      },
    });

    expect(result.valued).toBe(2);
    expect(result.total).toBe(3);
    // Invertido: 800 € + 10 € = 810 €. Valor: 900 € + 12 $/1,1.
    expect(result.invested).toBeCloseTo(810, 6);
    expect(result.marketValue).toBeCloseTo(900 + 12 / 1.1, 6);
  });

  it("excluye posiciones cuya divisa no es convertible (sin tasa)", () => {
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

  it("deja pnlPct en null cuando lo invertido es 0", () => {
    const result = aggregatePortfolio({
      display,
      rates: RATES,
      positions: [{ ticker: "A", quantity: 0, avgPrice: 0, currency: "EUR", isDerivative: false }],
      prices: { A: { close: 100, currency: "EUR" } },
    });

    expect(result.invested).toBe(0);
    expect(result.pnlPct).toBeNull();
  });

  it("deja los derivados fuera del total, aunque tengan precio", () => {
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
