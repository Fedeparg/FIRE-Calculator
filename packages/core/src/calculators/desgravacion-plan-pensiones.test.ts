import { describe, expect, it } from "vitest";
import { computePensionRelief } from "./desgravacion-plan-pensiones.js";

describe("computePensionRelief", () => {
  it("component defaults (golden)", () => {
    const r = computePensionRelief({ grossAnnual: 40000, contribution: 1500 });
    expect(r.appliedContribution).toBe(1500);
    expect(r.excess).toBe(0);
    expect(r.taxSaving).toBe(464); // €1,500 in the 30% marginal bracket + regional
    expect(r.netCost).toBe(1036);
    expect(r.savingRate).toBeCloseTo(30.933333333, 6);
  });

  it("caps the contribution at the €1,500 legal maximum", () => {
    const r = computePensionRelief({ grossAnnual: 40000, contribution: 3000 });
    expect(r.appliedContribution).toBe(1500);
    expect(r.excess).toBe(1500);
  });

  it("the higher the marginal bracket, the larger the tax saving", () => {
    const low = computePensionRelief({ grossAnnual: 20000, contribution: 1500 });
    const high = computePensionRelief({ grossAnnual: 60000, contribution: 1500 });
    expect(high.taxSaving).toBeGreaterThan(low.taxSaving);
  });

  it("the net cost is the contribution minus the saving", () => {
    const r = computePensionRelief({ grossAnnual: 40000, contribution: 1500 });
    expect(r.netCost).toBeCloseTo(r.appliedContribution - r.taxSaving, 6);
    expect(r.savingRate).toBeGreaterThan(0);
  });

  it("without a contribution, zero saving (no division by zero)", () => {
    const r = computePensionRelief({ grossAnnual: 40000, contribution: 0 });
    expect(r.taxSaving).toBe(0);
    expect(r.savingRate).toBe(0);
  });

  it("the employer contribution does NOT produce a direct IRPF saving", () => {
    const withoutEmployer = computePensionRelief({ grossAnnual: 60000, contribution: 1500 });
    const withEmployer = computePensionRelief({ grossAnnual: 60000, contribution: 1500, employerContribution: 8500 });
    expect(withEmployer.taxSaving).toBe(withoutEmployer.taxSaving); // the saving depends only on the individual contribution
    expect(withEmployer.netCost).toBe(withoutEmployer.netCost);
  });

  it("the employer contribution is capped at €8,500 and at the €10,000 combined limit", () => {
    const r = computePensionRelief({ grossAnnual: 60000, contribution: 1500, employerContribution: 12000 });
    expect(r.appliedContribution).toBe(1500);
    expect(r.employerApplied).toBe(8500); // employer cap
    expect(r.totalApplied).toBe(10000); // combined limit
  });

  it("individual + employer combined does not exceed €10,000", () => {
    const r = computePensionRelief({ grossAnnual: 60000, contribution: 1500, employerContribution: 9000 });
    expect(r.totalApplied).toBeLessThanOrEqual(10000);
    expect(r.employerApplied).toBe(8500);
  });
});
