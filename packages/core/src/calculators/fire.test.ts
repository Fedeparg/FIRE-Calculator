import { describe, expect, it } from "vitest";
import { computeFire } from "./fire.js";
import { defined } from "../assert.js";

const base = {
  annualExpenses: 24000,
  currentSavings: 20000,
  savings: 800,
  annualReturn: 5,
  withdrawalRate: 4,
};

describe("computeFire", () => {
  it("applies the 4% rule (FIRE number = 25x annual expenses)", () => {
    const r = computeFire(base);
    expect(r.fireNumber).toBe(600000);
  });

  it("uses a different withdrawal rate when given", () => {
    const r = computeFire({ ...base, withdrawalRate: 3 });
    expect(r.fireNumber).toBeCloseTo(24000 / 0.03, 6);
  });

  it("avoids dividing by zero: a 0 withdrawal rate falls back to the default 4%", () => {
    const r = computeFire({ ...base, withdrawalRate: 0 });
    expect(Number.isFinite(r.fireNumber)).toBe(true);
    expect(r.fireNumber).toBe(600000);
  });

  it("detects that you are already independent if wealth exceeds the target", () => {
    const r = computeFire({ ...base, currentSavings: 700000 });
    expect(r.yearsToFire).toBe(0);
  });

  it("computes years to FIRE and wealth reaches the target at that point", () => {
    const r = computeFire(base);
    expect(r.yearsToFire).not.toBeNull();
    expect(r.yearsToFire).toBeGreaterThan(0);

    const reached = r.series.find((p) => p.year >= Math.ceil(defined(r.yearsToFire, "years to FIRE")));
    expect(reached?.value).toBeGreaterThanOrEqual(r.fireNumber);
  });

  it("returns null if it is not reached within the 60-year horizon", () => {
    const r = computeFire({
      annualExpenses: 1_000_000,
      currentSavings: 0,
      savings: 1,
      annualReturn: 0,
      withdrawalRate: 4,
    });
    expect(r.yearsToFire).toBeNull();
    expect(r.series.length).toBeLessThanOrEqual(61);
  });

  it("golden: with the component defaults it takes 27 years", () => {
    const r = computeFire({ ...base, frequency: "monthly", savingsGrowth: 0 });
    expect(r.fireNumber).toBe(600000);
    expect(r.yearsToFire).toBe(27);
  });

  it("keeps the target constant across the series", () => {
    const r = computeFire(base);
    for (const point of r.series) {
      expect(point.target).toBe(r.fireNumber);
    }
  });
});
