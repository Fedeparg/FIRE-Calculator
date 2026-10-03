import fc from "fast-check";
import { describe, it } from "vitest";

import { PROPERTY_PARAMS } from "../test-support/property-config.js";
import { computeFire } from "./fire.js";
import { simulateFire, withdrawalSensitivity, type MonteCarloInput } from "./fire-montecarlo.js";
import { firstItem } from "../arrays.js";

// Each simulation takes milliseconds: fewer cases and fewer paths than in the other properties.
const PARAMS = { ...PROPERTY_PARAMS, numRuns: 40 };
const OPTIONS = { paths: 200 };

const input = fc.record({
  annualExpenses: fc.double({ min: 0, max: 200_000, noNaN: true }),
  currentSavings: fc.double({ min: 0, max: 5e6, noNaN: true }),
  monthlySavings: fc.double({ min: 0, max: 10_000, noNaN: true }),
  annualReturn: fc.double({ min: -5, max: 15, noNaN: true }),
  volatility: fc.double({ min: 0, max: 60, noNaN: true }),
  withdrawalRate: fc.double({ min: 1, max: 10, noNaN: true }),
  retirementYears: fc.integer({ min: 0, max: 60 }),
}) satisfies fc.Arbitrary<MonteCarloInput>;

/** Same input, with a lognormal model or a historical one with any stock/bond mix. */
const anyModel: fc.Arbitrary<MonteCarloInput> = fc
  .tuple(input, fc.option(fc.double({ min: 0, max: 100, noNaN: true }), { nil: undefined }))
  .map(([i, stockShare]) => (stockShare === undefined ? i : { ...i, returnModel: { kind: "historical", stockShare } }));

describe("simulateFire — properties", () => {
  it("without volatility it matches the FIRE calculator at annual frequency", () => {
    fc.assert(
      fc.property(input, (i) => {
        const result = simulateFire({ ...i, volatility: 0 }, OPTIONS);
        const fire = computeFire({
          annualExpenses: i.annualExpenses,
          currentSavings: i.currentSavings,
          savings: i.monthlySavings * 12,
          frequency: "annual",
          annualReturn: i.annualReturn,
          withdrawalRate: i.withdrawalRate,
        });
        return result.fireNumber === fire.fireNumber && result.deterministicYearsToFire === fire.yearsToFire;
      }),
      PARAMS,
    );
  });

  it("rates are in [0, 1] and success never exceeds reaching FIRE", () => {
    fc.assert(
      fc.property(anyModel, (i) => {
        const r = simulateFire(i, OPTIONS);
        const inUnit = (x: number) => x >= 0 && x <= 1;
        const survivalOk = Number.isNaN(r.survivalRate) ? r.reachRate === 0 : inUnit(r.survivalRate);
        return inUnit(r.successRate) && inUnit(r.reachRate) && r.successRate <= r.reachRate && survivalOk;
      }),
      PARAMS,
    );
  });

  it("percentiles are ordered, finite and non-negative in every year", () => {
    fc.assert(
      fc.property(anyModel, (i) => {
        const r = simulateFire(i, OPTIONS);
        return r.series.every(
          (p) =>
            [p.p10, p.p25, p.p50, p.p75, p.p90, p.deterministic].every((v) => Number.isFinite(v) && v >= 0) &&
            p.p10 <= p.p25 &&
            p.p25 <= p.p50 &&
            p.p50 <= p.p75 &&
            p.p75 <= p.p90,
        );
      }),
      PARAMS,
    );
  });

  it("years to FIRE are ordered by percentile", () => {
    fc.assert(
      fc.property(anyModel, (i) => {
        const { p10, p50, p90 } = simulateFire(i, OPTIONS).yearsToFire;
        const order = (a: number | null, b: number | null) => (a === null ? b === null : b === null || a <= b);
        return order(p10, p50) && order(p50, p90);
      }),
      PARAMS,
    );
  });

  it("more retirement years never raise the probability of success", () => {
    fc.assert(
      fc.property(anyModel, fc.integer({ min: 1, max: 20 }), (i, extra) => {
        const shorter = simulateFire({ ...i, retirementYears: Math.min(40, i.retirementYears) }, OPTIONS);
        const longer = simulateFire({ ...i, retirementYears: Math.min(40, i.retirementYears) + extra }, OPTIONS);
        return longer.successRate <= shorter.successRate;
      }),
      PARAMS,
    );
  });

  it("the sensitivity table is the simulation of each rate on its own", () => {
    fc.assert(
      fc.property(anyModel, fc.double({ min: 1, max: 10, noNaN: true }), (i, rate) => {
        const row = firstItem(withdrawalSensitivity(i, [rate], OPTIONS));
        return row.successRate === simulateFire({ ...i, withdrawalRate: rate }, OPTIONS).successRate;
      }),
      PARAMS,
    );
  });
});
