import { describe, expect, it } from "vitest";

import { incomeDefaultsFor, isIsin, isinCountry } from "./isin.js";

describe("isIsin", () => {
  it("accepts well-formed ISINs and rejects tickers and arbitrary strings", () => {
    expect(isIsin("IE00B4L5Y983")).toBe(true);
    expect(isIsin("US0378331005")).toBe(true);
    expect(isIsin("AAPL")).toBe(false);
    expect(isIsin("ie00b4l5y983")).toBe(false);
    expect(isIsin("IE00B4L5Y98X")).toBe(false);
    expect(isIsin("IE00B4L5Y9831")).toBe(false);
  });
});

describe("isinCountry", () => {
  it("returns the country prefix or null", () => {
    expect(isinCountry("IE00B4L5Y983")).toBe("IE");
    expect(isinCountry("AAPL")).toBeNull();
  });
});

describe("incomeDefaultsFor", () => {
  it("fills in ISIN and country when the ticker is an ISIN", () => {
    expect(incomeDefaultsFor({ id: "p1", ticker: "US0378331005", name: "Apple", currency: "USD" })).toEqual({
      kind: "dividend",
      positionId: "p1",
      isin: "US0378331005",
      name: "Apple",
      country: "US",
      currency: "USD",
    });
  });

  it("without an ISIN it leaves isin and country empty and falls back to the ticker as the name", () => {
    expect(incomeDefaultsFor({ id: "p2", ticker: "AAPL", name: null, currency: "USD" })).toMatchObject({
      isin: null,
      country: null,
      name: "AAPL",
    });
  });
});
