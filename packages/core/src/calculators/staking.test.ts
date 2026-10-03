import { describe, expect, it } from "vitest";
import { computeStaking } from "./staking.js";

describe("computeStaking", () => {
  it("compounds annually at the APY", () => {
    const r = computeStaking({ principal: 1000, apy: 10, years: 3 });
    expect(r.finalValue).toBeCloseTo(1331, 6); // 1000 * 1.1^3
    expect(r.rewards).toBeCloseTo(331, 6);
  });

  it("without APY it produces no rewards", () => {
    const r = computeStaking({ principal: 5000, apy: 0, years: 10 });
    expect(r.rewards).toBeCloseTo(0, 6);
    expect(r.finalValue).toBeCloseTo(5000, 6);
  });

  it("exposes the series (one point per year plus year 0)", () => {
    const r = computeStaking({ principal: 1000, apy: 8, years: 5 });
    expect(r.series).toHaveLength(6);
    expect(r.rewards).toBeCloseTo(r.totalInterest, 6);
  });

  // Calculator defaults (see the explainer).
  it("golden: defaults €5,000 at 8% APY for 5 years with 19% withholding", () => {
    const r = computeStaking({ principal: 5000, apy: 8, years: 5, withholdingRate: 19 });
    expect(r.finalValue).toBeCloseTo(7346.640384000002, 6);
    expect(r.rewards).toBeCloseTo(2346.640384000002, 6);
    expect(r.withheld).toBeCloseTo(445.8616729600004, 6);
    expect(r.netRewards).toBeCloseTo(1900.7787110400018, 6);
    expect(r.netFinalValue).toBeCloseTo(6900.778711040002, 6);
  });
});
