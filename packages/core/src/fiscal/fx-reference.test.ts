import { describe, expect, it } from "vitest";

import { MAX_RATE_GAP_DAYS, referenceRateOn, toEur, type ReferenceRates } from "./fx-reference.js";

const rates: ReferenceRates = {
  USD: [
    { date: "2024-03-27", unitsPerEur: 1.0816 },
    // Maundy Thursday; no publication on Friday the 29th or Monday 1 April (TARGET2 closed).
    { date: "2024-03-28", unitsPerEur: 1.0811 },
    { date: "2024-04-02", unitsPerEur: 1.0745 },
  ],
  CHF: [],
};

describe("referenceRateOn", () => {
  it("the euro is worth 1 without needing a series", () => {
    expect(referenceRateOn({}, "EUR", "2024-01-01")).toEqual({ currency: "EUR", unitsPerEur: 1, date: "2024-01-01" });
  });

  it("uses the same-day publication", () => {
    expect(referenceRateOn(rates, "USD", "2024-04-02")).toEqual({
      currency: "USD",
      unitsPerEur: 1.0745,
      date: "2024-04-02",
    });
  });

  it("on holidays and weekends uses the last earlier publication", () => {
    expect(referenceRateOn(rates, "USD", "2024-03-29")?.date).toBe("2024-03-28");
    expect(referenceRateOn(rates, "USD", "2024-04-01")?.date).toBe("2024-03-28");
  });

  it("never uses a later publication", () => {
    expect(referenceRateOn(rates, "USD", "2024-03-26")).toBeNull();
  });

  it("has no rate without a series or with an empty one", () => {
    expect(referenceRateOn(rates, "GBP", "2024-04-02")).toBeNull();
    expect(referenceRateOn(rates, "CHF", "2024-04-02")).toBeNull();
  });

  it(`more than ${MAX_RATE_GAP_DAYS} days after the last publication the series is missing, not a holiday`, () => {
    expect(referenceRateOn(rates, "USD", "2024-04-09")?.date).toBe("2024-04-02");
    expect(referenceRateOn(rates, "USD", "2024-04-10")).toBeNull();
  });

  it("discards non-finite or non-positive rates", () => {
    const bad: ReferenceRates = {
      USD: [{ date: "2024-01-02", unitsPerEur: 0 }],
      JPY: [{ date: "2024-01-02", unitsPerEur: NaN }],
    };
    expect(referenceRateOn(bad, "USD", "2024-01-02")).toBeNull();
    expect(referenceRateOn(bad, "JPY", "2024-01-02")).toBeNull();
  });
});

describe("toEur", () => {
  it("divides by the units per euro", () => {
    expect(toEur(108.11, { currency: "USD", unitsPerEur: 1.0811, date: "2024-03-28" })).toBeCloseTo(100, 10);
    expect(toEur(0, { currency: "USD", unitsPerEur: 1.0811, date: "2024-03-28" })).toBe(0);
  });
});
