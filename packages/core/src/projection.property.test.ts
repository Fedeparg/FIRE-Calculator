import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { PROPERTY_PARAMS } from "./test-support/property-config.js";
import { COMPOUNDING_FREQUENCIES, FREQUENCIES, project, type ProjectionInput } from "./projection.js";

/** "Normal" inputs: non-negative amounts and rates, a reasonable horizon. */
const input = fc.record({
  initial: fc.double({ min: 0, max: 1e6, noNaN: true }),
  contribution: fc.double({ min: 0, max: 1e4, noNaN: true }),
  frequency: fc.constantFrom(...FREQUENCIES),
  annualRate: fc.double({ min: 0, max: 20, noNaN: true }),
  years: fc.integer({ min: 0, max: 50 }),
  contributionGrowth: fc.double({ min: 0, max: 10, noNaN: true }),
}) satisfies fc.Arbitrary<ProjectionInput>;

/** Relative tolerance for comparing floating-point sums. */
const close = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

describe("project — properties", () => {
  it("one more year never lowers the final value with non-negative return and contribution", () => {
    fc.assert(
      fc.property(input, (i) => {
        const now = project(i).finalValue;
        const later = project({ ...i, years: i.years + 1 }).finalValue;
        return later >= now || close(later, now);
      }),
      PROPERTY_PARAMS,
    );
  });

  it("a larger contribution or return never lowers the final value", () => {
    fc.assert(
      fc.property(input, fc.double({ min: 0, max: 1000, noNaN: true }), (i, extra) => {
        const base = project(i).finalValue;
        const moreContribution = project({ ...i, contribution: i.contribution + extra }).finalValue;
        const moreRate = project({ ...i, annualRate: i.annualRate + extra / 100 }).finalValue;
        return (
          (moreContribution >= base || close(moreContribution, base)) && (moreRate >= base || close(moreRate, base))
        );
      }),
      PROPERTY_PARAMS,
    );
  });

  it("without contributions, the contribution frequency does not change the result (only compounding does)", () => {
    fc.assert(
      fc.property(
        input,
        fc.constantFrom(...FREQUENCIES),
        fc.constantFrom(...COMPOUNDING_FREQUENCIES),
        fc.double({ min: -30, max: 30, noNaN: true }),
        (i, other, compounding, annualRate) => {
          const base = { ...i, contribution: 0, compounding, annualRate };
          return close(project(base).finalValue, project({ ...base, frequency: other }).finalValue);
        },
      ),
      PROPERTY_PARAMS,
    );
  });

  it("with a 0 return the value is exactly what was contributed, with no interest", () => {
    fc.assert(
      fc.property(input, (i) => {
        const result = project({ ...i, annualRate: 0 });
        return result.series.every((p) => close(p.value, p.contributed) && close(p.interest, 0));
      }),
      PROPERTY_PARAMS,
    );
  });

  it("value = contributed + interest every year, and never below what was contributed", () => {
    fc.assert(
      fc.property(input, (i) => {
        const result = project(i);
        return result.series.every(
          (p) =>
            close(p.value, p.contributed + p.interest) && (p.value >= p.contributed || close(p.value, p.contributed)),
        );
      }),
      PROPERTY_PARAMS,
    );
  });

  it("the series has one point per year, from 0 to the horizon", () => {
    fc.assert(
      fc.property(input, (i) => {
        const result = project(i);
        expect(result.series.map((p) => p.year)).toEqual(Array.from({ length: i.years + 1 }, (_, y) => y));
      }),
      PROPERTY_PARAMS,
    );
  });
});
