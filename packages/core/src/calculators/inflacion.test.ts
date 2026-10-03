import { describe, expect, it } from "vitest";
import { computeInflation } from "./inflacion.js";
import { itemAt } from "../arrays.js";

describe("computeInflation", () => {
  it("computes the nominal amount needed and the loss of purchasing power", () => {
    const r = computeInflation({ amount: 1000, annualRate: 3, years: 10 });
    expect(r.nominalNeeded).toBeCloseTo(1000 * Math.pow(1.03, 10), 6);
    expect(r.realValue).toBeCloseTo(1000 / Math.pow(1.03, 10), 6);
    expect(r.lossPercent).toBeCloseTo(((1000 - r.realValue) / 1000) * 100, 6);
  });

  it("with zero inflation the value does not change", () => {
    const r = computeInflation({ amount: 1000, annualRate: 0, years: 20 });
    expect(r.nominalNeeded).toBeCloseTo(1000, 6);
    expect(r.realValue).toBeCloseTo(1000, 6);
    expect(r.lossPercent).toBeCloseTo(0, 6);
  });

  it("produces one point per year plus year 0", () => {
    const r = computeInflation({ amount: 500, annualRate: 2, years: 15 });
    expect(r.series).toHaveLength(16);
    expect(r.series[0]).toEqual({
      year: 0,
      nominalNeeded: 500,
      realValue: 500,
      realValueInvested: 500,
    });
  });

  it("purchasing power decreases with positive inflation", () => {
    const r = computeInflation({ amount: 1000, annualRate: 4, years: 10 });
    for (let k = 1; k < r.series.length; k++) {
      expect(itemAt(r.series, k).realValue).toBeLessThan(itemAt(r.series, k - 1).realValue);
    }
  });

  it("without a return, invested money equals idle money", () => {
    const r = computeInflation({ amount: 1000, annualRate: 3, years: 10 });
    expect(r.realValueInvested).toBeCloseTo(r.realValue, 6);
    expect(r.realReturn).toBeCloseTo((1 / 1.03 - 1) * 100, 6);
  });

  it("investing below inflation helps but does not preserve purchasing power (golden, defaults)", () => {
    const r = computeInflation({ amount: 10000, annualRate: 3, years: 20, nominalReturn: 2 });
    expect(Math.round(r.nominalNeeded)).toBe(18061);
    expect(Math.round(r.realValue)).toBe(5537);
    expect(Math.round(r.realValueInvested)).toBe(8227);
    expect(r.lossPercent).toBeCloseTo(44.63, 2);
    expect(r.realReturn).toBeCloseTo(-0.971, 3);
    // Invested money keeps more purchasing power than idle money, but still loses.
    expect(r.realValueInvested).toBeGreaterThan(r.realValue);
    expect(r.realValueInvested).toBeLessThan(10000);
  });

  it("investing above inflation gives a positive real return", () => {
    const r = computeInflation({ amount: 1000, annualRate: 2, years: 30, nominalReturn: 6 });
    expect(r.realReturn).toBeGreaterThan(0);
    expect(r.realValueInvested).toBeGreaterThan(1000);
  });

  it("with −100% inflation the real return stays at the nominal one, not Infinity", () => {
    const r = computeInflation({ amount: 1000, annualRate: -100, years: 5, nominalReturn: 6 });
    expect(r.realReturn).toBeCloseTo(6, 10);
  });
});
