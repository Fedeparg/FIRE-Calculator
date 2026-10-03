import { describe, expect, it } from "vitest";
import { FREQUENCIES } from "../projection.js";
import { computeCompound } from "./interes-compuesto.js";
import { itemAt } from "../arrays.js";

describe("computeCompound", () => {
  it("without interest (0%) it is the exact sum of the contributions", () => {
    const r = computeCompound({ initial: 1000, contribution: 100, annualRate: 0, years: 10 });
    // 1000 + 100 * 120 months
    expect(r.finalValue).toBe(13000);
    expect(r.totalContributed).toBe(13000);
    expect(r.totalInterest).toBe(0);
  });

  it("matches the closed-form annuity formula (effective annual rate, equivalent monthly period)", () => {
    const initial = 5000;
    const contribution = 300;
    const annualRate = 7;
    const years = 25;
    // effective annual rate → equivalent monthly rate (1 + r)^(1/12) − 1
    const i = Math.pow(1 + annualRate / 100, 1 / 12) - 1;
    const n = years * 12;
    const expected = initial * Math.pow(1 + i, n) + contribution * ((Math.pow(1 + i, n) - 1) / i);

    const r = computeCompound({ initial, contribution, annualRate, years });
    expect(r.finalValue).toBeCloseTo(expected, 2);
    expect(r.totalContributed).toBe(initial + contribution * n);
    expect(r.totalInterest).toBeCloseTo(r.finalValue - r.totalContributed, 6);
  });

  it("respects the contribution frequency (annual contributes once a year)", () => {
    const r = computeCompound({
      initial: 0,
      contribution: 1200,
      frequency: "annual",
      annualRate: 0,
      years: 10,
    });
    expect(r.totalContributed).toBe(12000); // 1200 * 10
  });

  it("produces one point per year plus year 0", () => {
    const r = computeCompound({ initial: 0, contribution: 100, annualRate: 5, years: 30 });
    expect(r.series).toHaveLength(31);
    expect(r.series[0]).toEqual({ year: 0, contributed: 0, value: 0, interest: 0, realValue: 0 });
    expect(r.series.at(-1)?.year).toBe(30);
  });

  it("with a zero horizon it returns only the initial capital", () => {
    const r = computeCompound({ initial: 2500, contribution: 500, annualRate: 8, years: 0 });
    expect(r.finalValue).toBe(2500);
    expect(r.series).toHaveLength(1);
  });

  it("the series is monotonically increasing with positive contributions and interest", () => {
    const r = computeCompound({ initial: 1000, contribution: 200, annualRate: 6, years: 15 });
    for (let k = 1; k < r.series.length; k++) {
      expect(itemAt(r.series, k).value).toBeGreaterThan(itemAt(r.series, k - 1).value);
    }
  });

  it("the annual fee (TER) reduces the net return", () => {
    const sin = computeCompound({ initial: 10000, contribution: 0, annualRate: 7, years: 20 });
    const con = computeCompound({ initial: 10000, contribution: 0, annualRate: 7, years: 20, annualFee: 1 });
    expect(con.finalValue).toBeLessThan(sin.finalValue);
    // With the fee, it is equivalent to a 6% net return.
    const neto = computeCompound({ initial: 10000, contribution: 0, annualRate: 6, years: 20 });
    expect(con.finalValue).toBeCloseTo(neto.finalValue, 4);
  });

  it("contribution growth increases the amount contributed", () => {
    const fija = computeCompound({ initial: 0, contribution: 100, frequency: "annual", annualRate: 0, years: 5 });
    const creciente = computeCompound({
      initial: 0,
      contribution: 100,
      frequency: "annual",
      annualRate: 0,
      years: 5,
      contributionGrowth: 10,
    });
    expect(creciente.totalContributed).toBeGreaterThan(fija.totalContributed);
  });

  it("effective annual inflation discounts the real value as (1 + i)^years", () => {
    const r = computeCompound({ initial: 10000, contribution: 0, annualRate: 0, years: 10, inflationRate: 3 });
    expect(r.finalValue).toBe(10000);
    expect(r.finalRealValue).toBeCloseTo(10000 / Math.pow(1.03, 10), 4);
  });

  it("if the return equals inflation, the real value stays constant", () => {
    const r = computeCompound({ initial: 5000, contribution: 0, annualRate: 7, years: 30, inflationRate: 7 });
    expect(r.finalValue).toBeGreaterThan(5000); // the nominal value does grow
    expect(r.finalRealValue).toBeCloseTo(5000, 6); // but the purchasing power does not
    // And it is independent of the horizon.
    const r10 = computeCompound({ initial: 5000, contribution: 0, annualRate: 7, years: 10, inflationRate: 7 });
    expect(r10.finalRealValue).toBeCloseTo(5000, 6);
  });

  it("without inflation, the real value matches the nominal value", () => {
    const r = computeCompound({ initial: 5000, contribution: 100, annualRate: 5, years: 10 });
    expect(r.finalRealValue).toBeCloseTo(r.finalValue, 6);
  });

  it("treats negative or NaN values as zero (input robustness)", () => {
    const r = computeCompound({
      initial: -1000,
      contribution: Number.NaN,
      annualRate: 5,
      years: 10,
    });
    expect(r.finalValue).toBe(0);
    expect(r.totalContributed).toBe(0);
  });

  it("with zero contribution and 1 year, €10,000 at 7% yields €10,700 at any frequency", () => {
    for (const frequency of FREQUENCIES) {
      const r = computeCompound({ initial: 10000, contribution: 0, frequency, annualRate: 7, years: 1 });
      expect(r.finalValue).toBeCloseTo(10700, 8);
    }
  });

  it("compounding is chosen separately from contributions: monthly at a 7% nominal rate gives (1 + 0.07/12)^12", () => {
    for (const frequency of FREQUENCIES) {
      const r = computeCompound({
        initial: 10000,
        contribution: 0,
        frequency,
        compounding: "monthly",
        annualRate: 7,
        years: 1,
      });
      expect(r.finalValue).toBeCloseTo(10000 * Math.pow(1 + 0.07 / 12, 12), 8);
    }
  });
});
