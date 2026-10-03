import { describe, expect, it } from "vitest";

import { estimateSavingsTax, savingsTax } from "./savings-tax.js";

describe("savingsTax", () => {
  it("base 0: tax 0 and null average rate", () => {
    expect(savingsTax(0)).toEqual({ tax: 0, averageRatePct: null });
  });

  it("applies the savings scale bracket by bracket", () => {
    const { tax, averageRatePct } = savingsTax(10000);
    expect(tax).toBeCloseTo(6000 * 0.19 + 4000 * 0.21, 9);
    expect(averageRatePct).toBeCloseTo((tax / 10000) * 100, 9);
  });
});

describe("estimateSavingsTax", () => {
  it("does not tax a loss or a zero gain", () => {
    for (const gain of [-1000, 0]) {
      const est = estimateSavingsTax(gain);
      expect(est.tax).toBe(0);
      expect(est.base).toBe(0);
      expect(est.effectiveRate).toBeNull();
      expect(est.net).toBe(gain);
    }
  });

  it("applies the first bracket at 19%", () => {
    const est = estimateSavingsTax(1000);
    expect(est.tax).toBeCloseTo(190, 10);
    expect(est.effectiveRate).toBeCloseTo(19, 10);
    expect(est.marginal).toBe(19);
    expect(est.net).toBeCloseTo(810, 10);
  });

  it("exact edge of the first bracket (€6,000)", () => {
    expect(estimateSavingsTax(6000).tax).toBeCloseTo(1140, 10);
  });

  it("exact edge of the second bracket (€50,000)", () => {
    // 6,000 at 19% + 44,000 at 21%.
    expect(estimateSavingsTax(50000).tax).toBeCloseTo(1140 + 9240, 10);
  });

  it("exact edge of the third bracket (€200,000)", () => {
    // … + 150,000 at 23%.
    expect(estimateSavingsTax(200000).tax).toBeCloseTo(1140 + 9240 + 34500, 10);
  });

  it("exact edge of the fourth bracket (€300,000)", () => {
    // … + 100,000 at 27%.
    expect(estimateSavingsTax(300000).tax).toBeCloseTo(1140 + 9240 + 34500 + 27000, 10);
  });

  it("the top bracket has a 30% marginal rate", () => {
    const est = estimateSavingsTax(400000);
    expect(est.marginal).toBe(30);
    expect(est.tax).toBeCloseTo(1140 + 9240 + 34500 + 27000 + 30000, 10);
  });

  it("a non-finite gain does not produce a made-up number", () => {
    const est = estimateSavingsTax(Number.POSITIVE_INFINITY);
    expect(Number.isNaN(est.tax)).toBe(true);
    expect(est.effectiveRate).toBeNull();
  });
});
