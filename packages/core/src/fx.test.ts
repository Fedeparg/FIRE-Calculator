import { describe, expect, it } from "vitest";

import { canConvert, convertCurrency } from "./fx.js";

// USD per unit: 1 EUR = 1.10 USD; 1 GBP = 1.25 USD; USD = 1.
const RATES = { USD: 1, EUR: 1.1, GBP: 1.25 };

describe("convertCurrency", () => {
  it("returns the same amount when source and target match", () => {
    expect(convertCurrency(100, "EUR", "EUR", RATES)).toBe(100);
  });

  it("converts A→B pivoting through USD", () => {
    // 100 EUR → USD = 110; USD → GBP = 110 / 1.25 = 88.
    expect(convertCurrency(100, "EUR", "GBP", RATES)).toBeCloseTo(88, 6);
    // 100 EUR → USD = 110.
    expect(convertCurrency(100, "EUR", "USD", RATES)).toBeCloseTo(110, 6);
  });

  it("returns null if the source or target rate is missing", () => {
    expect(convertCurrency(100, "JPY", "EUR", RATES)).toBeNull();
    expect(convertCurrency(100, "EUR", "JPY", RATES)).toBeNull();
  });

  it("treats a 0 rate as not convertible (avoids dividing by zero)", () => {
    expect(convertCurrency(100, "EUR", "GBP", { ...RATES, GBP: 0 })).toBeNull();
  });

  it("returns null on a non-finite rate (does not make up numbers)", () => {
    expect(convertCurrency(100, "EUR", "GBP", { ...RATES, GBP: Number.NaN })).toBeNull();
    expect(convertCurrency(100, "EUR", "USD", { ...RATES, EUR: Number.POSITIVE_INFINITY })).toBeNull();
  });

  it("the USD pivot is 1 even if missing from the rates (or given a bad value)", () => {
    expect(convertCurrency(100, "EUR", "USD", { EUR: 1.1 })).toBeCloseTo(110, 6);
    expect(convertCurrency(110, "USD", "EUR", { EUR: 1.1 })).toBeCloseTo(100, 6);
    expect(convertCurrency(100, "EUR", "USD", { ...RATES, USD: Number.NaN })).toBeCloseTo(110, 6);
  });
});

describe("canConvert", () => {
  it("matches convertCurrency without converting anything", () => {
    expect(canConvert("EUR", "GBP", RATES)).toBe(true);
    expect(canConvert("JPY", "JPY", {})).toBe(true);
    expect(canConvert("JPY", "EUR", RATES)).toBe(false);
    expect(canConvert("EUR", "JPY", RATES)).toBe(false);
    expect(canConvert("EUR", "USD", { EUR: 1.1 })).toBe(true);
  });
});
