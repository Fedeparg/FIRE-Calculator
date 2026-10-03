import { describe, expect, it } from "vitest";

import {
  estimateWithStatutoryRate,
  resolveFromBroker,
  resolveWithMarket,
  type DividendFacts,
} from "./dividend-resolution.js";

const facts = (overrides: Partial<DividendFacts>): DividendFacts => ({
  amount: 1,
  tax: 0,
  originalAmount: null,
  reported: true,
  country: "US",
  ...overrides,
});

// Real cases checked against Trade Republic's 2025 tax reports.
describe("resolveFromBroker", () => {
  it("US after the Spanish branch: `tax` adds source-country and Spanish withholding (Meta 0.46 → 0.07 + 0.07)", () => {
    expect(resolveFromBroker(facts({ amount: 0.46, tax: 0.14 }))).toEqual({
      gross: 0.46,
      origin: 0.07,
      spain: 0.07,
      grossSource: "broker",
      originSource: "derived",
    });
  });

  it("before the Spanish branch `tax` is the withholding at source (Apple 0.11 → 0.02)", () => {
    expect(resolveFromBroker(facts({ amount: 0.11, tax: 0.02, reported: false }))).toMatchObject({
      gross: 0.11,
      origin: 0.02,
      spain: 0,
      originSource: "broker",
    });
  });

  it("Netherlands net of source withholding: grossing it up at 15% is an estimate (ASML 1.36 → 1.60)", () => {
    expect(resolveFromBroker(facts({ amount: 1.36, tax: 0.26, country: "NL" }))).toEqual({
      gross: 1.6,
      origin: 0.24,
      spain: 0.26,
      grossSource: "estimate",
      originSource: "estimate",
    });
  });

  it("does not infer the source withholding for a country with no known rate", () => {
    expect(resolveFromBroker(facts({ amount: 0.35, tax: 0.07, country: "CN" }))).toMatchObject({
      gross: 0.35,
      origin: null,
      spain: 0.07,
      originSource: null,
    });
    expect(resolveFromBroker(facts({ amount: 1.44, country: "CN", reported: false })).origin).toBeNull();
  });

  it("a Spanish dividend has no withholding at source", () => {
    expect(resolveFromBroker(facts({ amount: 10, tax: 1.9, country: "ES" }))).toMatchObject({ origin: 0, spain: 1.9 });
  });

  it("a tiny amount with no withholding gets a derived source withholding of 0", () => {
    expect(resolveFromBroker(facts({ amount: 0.01 }))).toMatchObject({ origin: 0, originSource: "derived" });
  });

  it("what does not fit is left without a source withholding and the Spanish one is capped at 19% of the amount received", () => {
    expect(resolveFromBroker(facts({ amount: 10, tax: 2.5 }))).toMatchObject({ origin: null, spain: 1.9 });
  });
});

describe("resolveWithMarket", () => {
  it("when the market figure exceeds the amount paid out, the difference is the withholding at source (ASML)", () => {
    // 1 share × €1.60 dividend per share, 1.36 paid out.
    expect(resolveWithMarket(facts({ amount: 1.36, tax: 0.26, country: "NL" }), 1.6)).toEqual({
      gross: 1.6,
      origin: 0.24,
      spain: 0.26,
      grossSource: "market",
      originSource: "market",
    });
  });

  it("compares in the payment currency and converts to euros at the broker's rate (Switzerland at 35%)", () => {
    // 10 shares × CHF 3.05 = CHF 30.50 gross; CHF 19.83 paid out = €21.10 (CHF 1 = €1.0640).
    const result = resolveWithMarket(
      facts({ amount: 21.1, originalAmount: 19.83, tax: 0, reported: false, country: "CH" }),
      30.5,
    );
    expect(result).toMatchObject({ grossSource: "market", originSource: "market", spain: 0 });
    expect(result?.gross).toBeCloseTo(32.45, 2);
    expect(result?.origin).toBeCloseTo(11.35, 2);
  });

  it("when the market figure matches the amount paid out, the gross is the broker's and, with no other withholding, the source withholding is 0", () => {
    expect(resolveWithMarket(facts({ amount: 5, tax: 0, reported: false, country: "GB" }), 5)).toMatchObject({
      gross: 5,
      origin: 0,
      originSource: "market",
    });
  });

  it("keeps what the broker already resolved when the market figure confirms it", () => {
    expect(resolveWithMarket(facts({ amount: 0.46, tax: 0.14 }), 0.46)).toMatchObject({
      origin: 0.07,
      originSource: "derived",
    });
  });

  it("discards a market figure below the amount paid out or one that would imply an implausible withholding", () => {
    expect(resolveWithMarket(facts({ amount: 1.36, tax: 0.26, country: "NL" }), 1.2)).toBeNull();
    expect(resolveWithMarket(facts({ amount: 1, tax: 0, country: "NL" }), 3)).toBeNull();
    expect(resolveWithMarket(facts({ amount: 1 }), 0)).toBeNull();
  });
});

describe("estimateWithStatutoryRate", () => {
  it("assumes the amount paid out arrived net of the statutory rate and flags it as an estimate", () => {
    expect(estimateWithStatutoryRate(facts({ amount: 0.9, tax: 0, reported: false, country: "CN" }), 0.1)).toEqual({
      gross: 1,
      origin: 0.1,
      spain: 0,
      grossSource: "estimate",
      originSource: "estimate",
    });
  });
});
