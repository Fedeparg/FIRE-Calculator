import { describe, expect, it } from "vitest";

import { canConvert, convertCurrency } from "./fx.js";

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
    expect(convertCurrency(100, "EUR", "GBP", { ...RATES, GBP: Number.NaN })).toBeNull();
    expect(convertCurrency(100, "EUR", "USD", { ...RATES, EUR: Number.POSITIVE_INFINITY })).toBeNull();
  });

  it("el pivote USD vale 1 aunque no venga en las tasas (ni con un valor erróneo)", () => {
    expect(convertCurrency(100, "EUR", "USD", { EUR: 1.1 })).toBeCloseTo(110, 6);
    expect(convertCurrency(110, "USD", "EUR", { EUR: 1.1 })).toBeCloseTo(100, 6);
    expect(convertCurrency(100, "EUR", "USD", { ...RATES, USD: Number.NaN })).toBeCloseTo(110, 6);
  });
});

describe("canConvert", () => {
  it("coincide con convertCurrency sin convertir nada", () => {
    expect(canConvert("EUR", "GBP", RATES)).toBe(true);
    expect(canConvert("JPY", "JPY", {})).toBe(true);
    expect(canConvert("JPY", "EUR", RATES)).toBe(false);
    expect(canConvert("EUR", "JPY", RATES)).toBe(false);
    expect(canConvert("EUR", "USD", { EUR: 1.1 })).toBe(true);
  });
});
