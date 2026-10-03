import { describe, expect, it } from "vitest";

import { incomeDefaultsFor, isIsin, isinCountry } from "./isin.js";

describe("isIsin", () => {
  it("acepta ISIN con su forma y rechaza tickers y cadenas sueltas", () => {
    expect(isIsin("IE00B4L5Y983")).toBe(true);
    expect(isIsin("US0378331005")).toBe(true);
    expect(isIsin("AAPL")).toBe(false);
    expect(isIsin("ie00b4l5y983")).toBe(false);
    expect(isIsin("IE00B4L5Y98X")).toBe(false);
    expect(isIsin("IE00B4L5Y9831")).toBe(false);
  });
});

describe("isinCountry", () => {
  it("devuelve el prefijo de país o null", () => {
    expect(isinCountry("IE00B4L5Y983")).toBe("IE");
    expect(isinCountry("AAPL")).toBeNull();
  });
});

describe("incomeDefaultsFor", () => {
  it("rellena ISIN y país cuando el ticker es un ISIN", () => {
    expect(incomeDefaultsFor({ id: "p1", ticker: "US0378331005", name: "Apple", currency: "USD" })).toEqual({
      kind: "dividend",
      positionId: "p1",
      isin: "US0378331005",
      name: "Apple",
      country: "US",
      currency: "USD",
    });
  });

  it("sin ISIN deja isin y país vacíos y usa el ticker como nombre si falta", () => {
    expect(incomeDefaultsFor({ id: "p2", ticker: "AAPL", name: null, currency: "USD" })).toMatchObject({
      isin: null,
      country: null,
      name: "AAPL",
    });
  });
});
