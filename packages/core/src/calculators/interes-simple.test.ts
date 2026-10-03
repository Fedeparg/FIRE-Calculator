import { describe, expect, it } from "vitest";
import { computeSimpleInterest } from "./interes-simple.js";

describe("computeSimpleInterest", () => {
  it("always computes interest on the initial capital", () => {
    const r = computeSimpleInterest({ principal: 1000, annualRate: 5, years: 10 });
    expect(r.totalInterest).toBeCloseTo(500, 6); // 1000 * 0.05 * 10
    expect(r.finalValue).toBeCloseTo(1500, 6);
  });

  it("produces one point per year plus year 0 and grows linearly", () => {
    const r = computeSimpleInterest({ principal: 1000, annualRate: 10, years: 3 });
    expect(r.series).toHaveLength(4);
    expect(r.series.map((p) => p.value)).toEqual([1000, 1100, 1200, 1300]);
  });

  it("with a zero horizon it returns the initial capital without interest", () => {
    const r = computeSimpleInterest({ principal: 2500, annualRate: 8, years: 0 });
    expect(r.finalValue).toBe(2500);
    expect(r.totalInterest).toBe(0);
    expect(r.series).toHaveLength(1);
  });

  it("treats negative capital as zero", () => {
    const r = computeSimpleInterest({ principal: -1000, annualRate: 5, years: 10 });
    expect(r.finalValue).toBe(0);
  });

  it("applies the default withholding (19%) to the interest", () => {
    const r = computeSimpleInterest({ principal: 1000, annualRate: 5, years: 10 });
    expect(r.withheld).toBeCloseTo(95, 6); // 500 * 0.19
    expect(r.netInterest).toBeCloseTo(405, 6);
    expect(r.netFinalValue).toBeCloseTo(1405, 6);
  });

  // Calculator defaults (see the explainer).
  it("golden: defaults €10,000 at 4% for 15 years with 19% withholding", () => {
    const r = computeSimpleInterest({ principal: 10000, annualRate: 4, years: 15, withholdingRate: 19 });
    expect(r.finalValue).toBe(16000);
    expect(r.totalInterest).toBe(6000);
    expect(r.withheld).toBeCloseTo(1140, 6);
    expect(r.netInterest).toBeCloseTo(4860, 6);
    expect(r.netFinalValue).toBeCloseTo(14860, 6);
  });
});
