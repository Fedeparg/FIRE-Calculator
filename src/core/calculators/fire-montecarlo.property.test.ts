import fc from "fast-check";
import { describe, it } from "vitest";

import { PROPERTY_PARAMS } from "../property-config";
import { computeFire } from "./fire";
import { simulateFire, type MonteCarloInput } from "./fire-montecarlo";

// Cada simulación cuesta milisegundos: menos casos y menos vidas que en el resto de propiedades.
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

describe("simulateFire — propiedades", () => {
  it("sin volatilidad coincide con la calculadora FIRE en frecuencia anual", () => {
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

  it("las tasas están en [0, 1] y el éxito nunca supera a la llegada", () => {
    fc.assert(
      fc.property(input, (i) => {
        const r = simulateFire(i, OPTIONS);
        const inUnit = (x: number) => x >= 0 && x <= 1;
        const survivalOk = Number.isNaN(r.survivalRate) ? r.reachRate === 0 : inUnit(r.survivalRate);
        return inUnit(r.successRate) && inUnit(r.reachRate) && r.successRate <= r.reachRate && survivalOk;
      }),
      PARAMS,
    );
  });

  it("los percentiles están ordenados, son finitos y no negativos en todos los años", () => {
    fc.assert(
      fc.property(input, (i) => {
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

  it("los años hasta FIRE están ordenados por percentil", () => {
    fc.assert(
      fc.property(input, (i) => {
        const { p10, p50, p90 } = simulateFire(i, OPTIONS).yearsToFire;
        const order = (a: number | null, b: number | null) => a === null ? b === null : b === null || a <= b;
        return order(p10, p50) && order(p50, p90);
      }),
      PARAMS,
    );
  });

  it("más años de retiro nunca suben la probabilidad de éxito", () => {
    fc.assert(
      fc.property(input, fc.integer({ min: 1, max: 20 }), (i, extra) => {
        const shorter = simulateFire({ ...i, retirementYears: Math.min(40, i.retirementYears) }, OPTIONS);
        const longer = simulateFire({ ...i, retirementYears: Math.min(40, i.retirementYears) + extra }, OPTIONS);
        return longer.successRate <= shorter.successRate;
      }),
      PARAMS,
    );
  });
});
