import { describe, expect, it } from "vitest";
import { computeMortgage } from "./calculators/hipoteca.js";
import { estimateNetSalary } from "./fiscal/irpf.js";
import { MAX_HORIZON_YEARS, clampYears, finiteOr, nonNegative } from "./inputs.js";
import { project } from "./projection.js";

describe("clampYears", () => {
  it("rounds and clamps to the [min, MAX_HORIZON_YEARS] range", () => {
    expect(clampYears(10.4)).toBe(10);
    expect(clampYears(-3)).toBe(0);
    expect(clampYears(0, 1)).toBe(1);
    expect(clampYears(1e9)).toBe(MAX_HORIZON_YEARS);
  });

  it("NaN counts as 0 and ±Infinity is clamped", () => {
    expect(clampYears(Number.NaN)).toBe(0);
    expect(clampYears(Number.NaN, 1)).toBe(1);
    expect(clampYears(Infinity)).toBe(MAX_HORIZON_YEARS);
    expect(clampYears(-Infinity, 1)).toBe(1);
  });
});

describe("infinite terms do not hang the calculators", () => {
  it("project returns a series as long as the cap", () => {
    const { series } = project({ initial: 1000, contribution: 0, frequency: "annual", annualRate: 5, years: Infinity });
    expect(series).toHaveLength(MAX_HORIZON_YEARS + 1);
  });

  it("an infinite-term mortgage is computed at the cap", () => {
    const r = computeMortgage({ principal: 100000, annualRate: 3, years: Infinity });
    expect(r.schedule).toHaveLength(MAX_HORIZON_YEARS);
    expect(Number.isFinite(r.monthlyPayment)).toBe(true);
  });
});

describe("infinite dependants do not hang the personal and family allowance", () => {
  it("children = Infinity terminates and gives a finite net figure", () => {
    const r = estimateNetSalary({
      grossAnnual: 40000,
      children: Infinity,
      childrenUnder3: Infinity,
      ascendants: Infinity,
    });
    expect(Number.isFinite(r.netPerPayment)).toBe(true);
  });
});

describe("finiteOr", () => {
  it("passes finite values through and replaces NaN and ±Infinity", () => {
    expect(finiteOr(-3.5, 7)).toBe(-3.5);
    expect(finiteOr(0, 7)).toBe(0);
    expect(finiteOr(Number.NaN, 7)).toBe(7);
    expect(finiteOr(Infinity, 7)).toBe(7);
    expect(finiteOr(-Infinity, 7)).toBe(7);
  });
});

describe("nonNegative", () => {
  it("keeps finite positives and turns everything else into 0", () => {
    expect(nonNegative(12.5)).toBe(12.5);
    expect(nonNegative(-1)).toBe(0);
    expect(Object.is(nonNegative(-0), 0)).toBe(true);
    expect(nonNegative(Number.NaN)).toBe(0);
    expect(nonNegative(Infinity)).toBe(0);
  });
});
