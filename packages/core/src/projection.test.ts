import { describe, expect, it } from "vitest";
import { COMPOUNDING_FREQUENCIES, FREQUENCIES, PERIODS_PER_YEAR, project } from "./projection.js";
import { itemAt } from "./arrays.js";

const relClose = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

describe("project (generic engine)", () => {
  it("contributes the right number of times per year for each frequency", () => {
    for (const [freq, ppy] of Object.entries(PERIODS_PER_YEAR)) {
      const r = project({
        initial: 0,
        contribution: 10,
        frequency: freq as keyof typeof PERIODS_PER_YEAR,
        annualRate: 0,
        years: 1,
      });
      expect(r.totalContributed).toBe(10 * ppy);
    }
  });

  it("splits value = contributed + interest at every point", () => {
    const r = project({
      initial: 1000,
      contribution: 100,
      frequency: "monthly",
      annualRate: 6,
      years: 20,
    });
    for (const p of r.series) {
      expect(p.value).toBeCloseTo(p.contributed + p.interest, 6);
    }
  });

  it("a higher compounding frequency gives a higher final value (same total contributed per year)", () => {
    const annual = project({ initial: 0, contribution: 1200, frequency: "annual", annualRate: 8, years: 30 });
    const monthly = project({ initial: 0, contribution: 100, frequency: "monthly", annualRate: 8, years: 30 });
    // Both contribute €1,200/year; the monthly one compounds more often.
    expect(monthly.totalContributed).toBeCloseTo(annual.totalContributed, 6);
    expect(monthly.finalValue).toBeGreaterThan(annual.finalValue);
  });

  describe("compounding independent of the contribution frequency", () => {
    const RATES = [0, 3, 7, 12.5, -2, -50];

    it("without contributions the result does not depend on the contribution frequency", () => {
      for (const compounding of [undefined, ...COMPOUNDING_FREQUENCIES]) {
        for (const annualRate of RATES) {
          const values = FREQUENCIES.map(
            (frequency) =>
              project({ initial: 10000, contribution: 0, frequency, compounding, annualRate, years: 1 }).finalValue,
          );
          for (const v of values) expect(relClose(v, itemAt(values, 0))).toBe(true);
        }
      }
    });

    it("the same over several years, and also with inflation and fees", () => {
      for (const years of [1, 7, 30]) {
        const results = FREQUENCIES.map((frequency) =>
          project({
            initial: 5000,
            contribution: 0,
            frequency,
            compounding: "monthly",
            annualRate: 6,
            annualFee: 0.5,
            inflationRate: 2.5,
            years,
          }),
        );
        for (const r of results) {
          expect(relClose(r.finalValue, itemAt(results, 0).finalValue)).toBe(true);
          expect(relClose(r.finalRealValue, itemAt(results, 0).finalRealValue)).toBe(true);
        }
      }
    });

    it("compounding is annual by default: the rate is the effective annual return", () => {
      for (const frequency of FREQUENCIES) {
        const r = project({ initial: 10000, contribution: 0, frequency, annualRate: 7, years: 1 });
        expect(r.finalValue).toBeCloseTo(10700, 8);
      }
    });

    it("monthly compounding at a nominal rate r gives (1 + r/12)^12 in one year", () => {
      for (const frequency of FREQUENCIES) {
        const r = project({
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

    it("more intra-year compounding yields more, with the same nominal rate", () => {
      const final = (compounding: "annual" | "semiannual" | "quarterly" | "monthly") =>
        project({ initial: 1000, contribution: 0, frequency: "monthly", compounding, annualRate: 8, years: 10 })
          .finalValue;
      expect(final("semiannual")).toBeGreaterThan(final("annual"));
      expect(final("quarterly")).toBeGreaterThan(final("semiannual"));
      expect(final("monthly")).toBeGreaterThan(final("quarterly"));
    });

    it("with contributions, the frequency only changes when they are made: same annual total, small difference", () => {
      const final = (frequency: "annual" | "monthly", contribution: number) =>
        project({ initial: 0, contribution, frequency, annualRate: 8, years: 30 }).finalValue;
      const ratio = final("monthly", 100) / final("annual", 1200);
      expect(ratio).toBeGreaterThan(1);
      expect(ratio).toBeLessThan(1.05);
    });

    it("one year of annual inflation discounts exactly 1 + i, with any frequency", () => {
      for (const frequency of FREQUENCIES) {
        const r = project({ initial: 1000, contribution: 0, frequency, annualRate: 0, years: 1, inflationRate: 4 });
        expect(r.finalRealValue).toBeCloseTo(1000 / 1.04, 9);
      }
    });

    it("a return of −100% or less wipes out the capital without giving NaN (annual compounding)", () => {
      for (const frequency of FREQUENCIES) {
        for (const annualRate of [-100, -150, -1e9]) {
          const r = project({ initial: 1000, contribution: 0, frequency, annualRate, years: 3 });
          expect(r.finalValue).toBe(0);
        }
      }
    });

    it("a very negative nominal rate with monthly compounding does not give NaN either", () => {
      const r = project({
        initial: 1000,
        contribution: 0,
        frequency: "monthly",
        compounding: "monthly",
        annualRate: -1e9,
        years: 3,
      });
      expect(r.finalValue).toBe(0);
    });
  });
});
