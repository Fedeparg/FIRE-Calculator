import { describe, expect, it } from "vitest";
import { computeDividends } from "./dividendos.js";

describe("computeDividends", () => {
  it("computes gross dividend, withholding (19%) and net", () => {
    const r = computeDividends({ shares: 100, dividendPerShare: 2 });
    expect(r.gross).toBe(200);
    expect(r.withheld).toBeCloseTo(38, 6); // 200 * 0.19
    expect(r.net).toBeCloseTo(162, 6);
  });

  it("computes the dividend yield when the price is given", () => {
    const r = computeDividends({ shares: 100, dividendPerShare: 2, sharePrice: 50 });
    expect(r.grossYield).toBeCloseTo(4, 6); // 200 / 5000
    expect(r.netYield).toBeCloseTo(3.24, 6); // 162 / 5000
  });

  it("returns a null yield without a price", () => {
    const r = computeDividends({ shares: 100, dividendPerShare: 2 });
    expect(r.grossYield).toBeNull();
    expect(r.netYield).toBeNull();
  });

  it("ignores negative values", () => {
    const r = computeDividends({ shares: -10, dividendPerShare: -1 });
    expect(r.gross).toBe(0);
    expect(r.net).toBe(0);
  });

  it("projects the net cash flow with annual dividend growth", () => {
    const r = computeDividends({ shares: 100, dividendPerShare: 1, annualGrowth: 10, years: 3 });
    // net year 1 = 81 (100*1*0.81); years: 81, 89.1, 98.01 → cumulative 268.11
    expect(r.series).toHaveLength(4); // year 0 + 3 years
    expect(r.finalYearNet).toBeCloseTo(98.01, 6);
    expect(r.cumulativeNet).toBeCloseTo(268.11, 6);
  });

  // Calculator defaults (see the explainer).
  it("golden: defaults 100 shares, €1.50, price €50, 19%, +5%/year, 10 years", () => {
    const r = computeDividends({
      shares: 100,
      dividendPerShare: 1.5,
      sharePrice: 50,
      withholdingRate: 19,
      annualGrowth: 5,
      years: 10,
    });
    expect(r.gross).toBe(150);
    expect(r.withheld).toBeCloseTo(28.5, 6);
    expect(r.net).toBeCloseTo(121.5, 6);
    expect(r.grossYield).toBeCloseTo(3, 6);
    expect(r.netYield).toBeCloseTo(2.43, 6);
    expect(r.cumulativeNet).toBeCloseTo(1528.213943069183, 6);
    expect(r.finalYearNet).toBeCloseTo(188.48637824138973, 6);
  });
});
