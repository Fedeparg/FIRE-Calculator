import { describe, expect, it } from "vitest";
import { computeRoi } from "./roi.js";

describe("computeRoi", () => {
  it("computes the gain and total ROI", () => {
    const r = computeRoi({ initial: 1000, final: 1500 });
    expect(r.gain).toBe(500);
    expect(r.roi).toBeCloseTo(50, 6);
    expect(r.annualized).toBeNull();
  });

  it("annualizes (CAGR) when the horizon is given", () => {
    const r = computeRoi({ initial: 1000, final: 1500, years: 2 });
    expect(r.annualized).toBeCloseTo((Math.sqrt(1.5) - 1) * 100, 6);
  });

  it("reflects losses as negative values", () => {
    const r = computeRoi({ initial: 1000, final: 800 });
    expect(r.gain).toBe(-200);
    expect(r.roi).toBeCloseTo(-20, 6);
  });

  it("avoids dividing by zero with a zero initial investment", () => {
    const r = computeRoi({ initial: 0, final: 500 });
    expect(r.roi).toBe(0);
    expect(r.annualized).toBeNull();
  });

  it("applies no tax when there is a loss", () => {
    const r = computeRoi({ initial: 1000, final: 800, taxRate: 19 });
    expect(r.tax).toBe(0);
    expect(r.netGain).toBe(-200);
  });

  // Calculator defaults (see the explainer).
  it("golden: defaults 1,000→1,500, 5 years, €20 costs, €50 income, 19%", () => {
    const r = computeRoi({ initial: 1000, final: 1500, years: 5, costs: 20, income: 50, taxRate: 19 });
    expect(r.invested).toBe(1020);
    expect(r.gain).toBe(530);
    expect(r.roi).toBeCloseTo(51.9607843137255, 6);
    expect(r.annualized).toBeCloseTo(8.729228205170436, 6);
    expect(r.tax).toBeCloseTo(100.7, 6);
    expect(r.netGain).toBeCloseTo(429.3, 6);
    expect(r.netRoi).toBeCloseTo(42.08823529411765, 6);
  });

  it("a tiny term that overflows the annualization leaves it without an answer", () => {
    const r = computeRoi({ initial: 1000, final: 1500, years: 1e-300 });
    expect(r.annualized).toBeNull();
  });
});
