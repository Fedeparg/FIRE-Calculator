import { describe, expect, it } from "vitest";
import { computeWealthTax } from "./impuesto-patrimonio.js";

describe("computeWealthTax", () => {
  it("component defaults (golden)", () => {
    const r = computeWealthTax({
      totalWealth: 1500000,
      primaryResidenceValue: 300000,
      exemptMinimum: 700000,
      regionalRebate: 0,
    });
    expect(r.residenceExemption).toBe(300000);
    expect(r.taxableBase).toBe(500000);
    // 167129.45×0.2% + (334252.88−167129.45)×0.3% + (500000−334252.88)×0.5%
    expect(r.grossTax).toBeCloseTo(1664.36479, 5);
    expect(r.tax).toBeCloseTo(1664.36479, 5);
    expect(r.effectiveRate).toBeCloseTo(0.110957652, 6);
  });

  it("below the exempt minimum there is no tax", () => {
    const r = computeWealthTax({ totalWealth: 600000, primaryResidenceValue: 0 });
    expect(r.taxableBase).toBe(0);
    expect(r.tax).toBe(0);
  });

  it("applies the primary residence exemption (max. €300,000)", () => {
    const r = computeWealthTax({ totalWealth: 1000000, primaryResidenceValue: 400000 });
    expect(r.residenceExemption).toBe(300000);
    // 1,000,000 − 300,000 residence − 700,000 minimum = 0
    expect(r.taxableBase).toBe(0);
  });

  it("computes a progressive tax on the excess", () => {
    const r = computeWealthTax({ totalWealth: 1700000, primaryResidenceValue: 0 });
    // base = 1,000,000 → 167,129.45×0.2% + (1,000,000−167,129.45)×0.3%
    expect(r.taxableBase).toBe(1000000);
    expect(r.tax).toBeGreaterThan(0);
  });

  it("the regional rebate reduces the tax", () => {
    const base = computeWealthTax({ totalWealth: 2000000, primaryResidenceValue: 0 });
    const madrid = computeWealthTax({ totalWealth: 2000000, primaryResidenceValue: 0, regionalRebate: 100 });
    expect(madrid.tax).toBe(0);
    expect(base.tax).toBeGreaterThan(0);
  });
});
