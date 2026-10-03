import { describe, expect, it } from "vitest";

import { estimateSavingsTax, savingsTax } from "./savings-tax.js";

describe("savingsTax", () => {
  it("base 0: cuota 0 y tipo medio null", () => {
    expect(savingsTax(0)).toEqual({ tax: 0, averageRatePct: null });
  });

  it("aplica la escala del ahorro por tramos", () => {
    const { tax, averageRatePct } = savingsTax(10000);
    expect(tax).toBeCloseTo(6000 * 0.19 + 4000 * 0.21, 9);
    expect(averageRatePct).toBeCloseTo((tax / 10000) * 100, 9);
  });
});

describe("estimateSavingsTax", () => {
  it("no grava una pérdida ni una ganancia nula", () => {
    for (const gain of [-1000, 0]) {
      const est = estimateSavingsTax(gain);
      expect(est.tax).toBe(0);
      expect(est.base).toBe(0);
      expect(est.effectiveRate).toBeNull();
      expect(est.net).toBe(gain);
    }
  });

  it("aplica el primer tramo al 19 %", () => {
    const est = estimateSavingsTax(1000);
    expect(est.tax).toBeCloseTo(190, 10);
    expect(est.effectiveRate).toBeCloseTo(19, 10);
    expect(est.marginal).toBe(19);
    expect(est.net).toBeCloseTo(810, 10);
  });

  it("borde exacto del primer tramo (6.000 €)", () => {
    expect(estimateSavingsTax(6000).tax).toBeCloseTo(1140, 10);
  });

  it("borde exacto del segundo tramo (50.000 €)", () => {
    // 6.000 al 19 % + 44.000 al 21 %.
    expect(estimateSavingsTax(50000).tax).toBeCloseTo(1140 + 9240, 10);
  });

  it("borde exacto del tercer tramo (200.000 €)", () => {
    // … + 150.000 al 23 %.
    expect(estimateSavingsTax(200000).tax).toBeCloseTo(1140 + 9240 + 34500, 10);
  });

  it("borde exacto del cuarto tramo (300.000 €)", () => {
    // … + 100.000 al 27 %.
    expect(estimateSavingsTax(300000).tax).toBeCloseTo(1140 + 9240 + 34500 + 27000, 10);
  });

  it("el último tramo es marginal al 30 %", () => {
    const est = estimateSavingsTax(400000);
    expect(est.marginal).toBe(30);
    expect(est.tax).toBeCloseTo(1140 + 9240 + 34500 + 27000 + 30000, 10);
  });

  it("una ganancia no finita no produce un número inventado", () => {
    const est = estimateSavingsTax(Number.POSITIVE_INFINITY);
    expect(Number.isNaN(est.tax)).toBe(true);
    expect(est.effectiveRate).toBeNull();
  });
});
