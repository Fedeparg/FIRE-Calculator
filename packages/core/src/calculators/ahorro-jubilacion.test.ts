import { describe, expect, it } from "vitest";
import { computeRetirement } from "./ahorro-jubilacion.js";

const base = {
  currentAge: 30,
  retirementAge: 65,
  currentSavings: 10000,
  monthlySavings: 300,
  annualReturn: 5,
};

describe("computeRetirement", () => {
  it("computes the years to retirement", () => {
    expect(computeRetirement(base).yearsToRetirement).toBe(35);
  });

  it("grows wealth above the amount contributed with a positive return", () => {
    const r = computeRetirement(base);
    expect(r.finalValue).toBeGreaterThan(r.totalContributed);
  });

  it("without inflation, the (real) monthly income comes from the nominal value with the 4% rule", () => {
    const r = computeRetirement(base);
    expect(r.finalRealValue).toBeCloseTo(r.finalValue, 6);
    expect(r.monthlyIncome).toBeCloseTo((r.finalRealValue * 0.04) / 12, 6);
  });

  it("inflation lowers the real value and separates real from nominal income", () => {
    const r = computeRetirement({ ...base, inflationRate: 2.5 });
    expect(r.finalRealValue).toBeLessThan(r.finalValue);
    expect(r.monthlyIncome).toBeLessThan(r.monthlyIncomeNominal);
    expect(r.monthlyIncome).toBeCloseTo((r.finalRealValue * 0.04) / 12, 6);
    expect(r.monthlyIncomeNominal).toBeCloseTo((r.finalValue * 0.04) / 12, 6);
  });

  it("fees (TER) reduce the final wealth", () => {
    const withFee = computeRetirement({ ...base, annualFee: 1 });
    expect(withFee.finalValue).toBeLessThan(computeRetirement(base).finalValue);
  });

  it("savings growth increases the amount contributed", () => {
    const grown = computeRetirement({ ...base, contributionGrowth: 3 });
    expect(grown.totalContributed).toBeGreaterThan(computeRetirement(base).totalContributed);
  });

  it("golden: component defaults (6% effective annual, 2.5% inflation, 0.3% TER)", () => {
    const r = computeRetirement({
      currentAge: 30,
      retirementAge: 67,
      currentSavings: 15000,
      monthlySavings: 300,
      annualReturn: 6,
      inflationRate: 2.5,
      annualFee: 0.3,
      contributionGrowth: 0,
    });
    expect(r.yearsToRetirement).toBe(37);
    expect(r.totalContributed).toBe(148200);
    expect(Math.round(r.finalValue)).toBe(555693);
    expect(Math.round(r.finalRealValue)).toBe(222870);
    expect(r.monthlyIncome).toBeCloseTo(742.9, 2);
  });

  it("at or past retirement age, it does not project (0 years)", () => {
    const r = computeRetirement({ ...base, currentAge: 67, retirementAge: 65 });
    expect(r.yearsToRetirement).toBe(0);
    expect(r.finalValue).toBe(base.currentSavings);
  });
});
