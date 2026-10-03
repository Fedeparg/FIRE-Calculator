import { describe, expect, it } from "vitest";
import { computeBudget } from "./presupuesto.js";

describe("computeBudget", () => {
  it("computes savings and the savings rate", () => {
    const r = computeBudget({ income: 2000, needs: 1000, wants: 600 });
    expect(r.savings).toBe(400);
    expect(r.savingsRate).toBeCloseTo(20, 6);
  });

  it("exposes annual savings and the percentages per category", () => {
    const r = computeBudget({ income: 2000, needs: 1000, wants: 600 });
    expect(r.annualSavings).toBe(4800);
    expect(r.needsRate).toBeCloseTo(50, 6);
    expect(r.wantsRate).toBeCloseTo(30, 6);
    expect(r.savingsRate).toBeCloseTo(20, 6);
  });

  it("without income, the percentages are 0 (no division by zero)", () => {
    const r = computeBudget({ income: 0, needs: 100, wants: 50 });
    expect(r.needsRate).toBe(0);
    expect(r.wantsRate).toBe(0);
  });

  it("applies the 50/30/20 rule to income", () => {
    const r = computeBudget({ income: 2000, needs: 0, wants: 0 });
    expect(r.recommendedNeeds).toBe(1000);
    expect(r.recommendedWants).toBe(600);
    expect(r.recommendedSavings).toBe(400);
  });

  it("reflects negative savings when overspending", () => {
    const r = computeBudget({ income: 2000, needs: 1500, wants: 800 });
    expect(r.savings).toBe(-300);
    expect(r.savingsRate).toBeLessThan(0);
  });

  it("without income, a zero savings rate (no division by zero)", () => {
    const r = computeBudget({ income: 0, needs: 0, wants: 0 });
    expect(r.savingsRate).toBe(0);
  });
});
