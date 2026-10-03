// Generic investment projection engine, shared by several calculators. Pure core.

import { clampYears } from "./inputs.js";

export const FREQUENCIES = ["weekly", "monthly", "quarterly", "semiannual", "annual"] as const;

export type Frequency = (typeof FREQUENCIES)[number];

export const PERIODS_PER_YEAR: Record<Frequency, number> = {
  weekly: 52,
  monthly: 12,
  quarterly: 4,
  semiannual: 2,
  annual: 1,
};

/** Frequencies that make sense for compounding interest (weekly is only used for contributions). */
export const COMPOUNDING_FREQUENCIES = [
  "monthly",
  "quarterly",
  "semiannual",
  "annual",
] as const satisfies readonly Frequency[];

export interface ProjectionInput {
  initial: number;
  contribution: number;
  frequency: Frequency;
  /**
   * Annual return, in percent (7 = 7%). It is the nominal rate (TIN) for the `compounding` period;
   * with the default (annual) it equals the effective annual return.
   */
  annualRate: number;
  /**
   * How often interest is credited and compounded; independent of `frequency` (when contributions
   * are made). Defaults to "annual": the rate reads as an annual return and there is no intra-year
   * compounding (market projections: FIRE, retirement, savings goal...).
   */
  compounding?: Frequency;
  years: number;
  /** Annual fee/expenses (TER), in percent; net return = annualRate − annualFee. */
  annualFee?: number;
  /** Annual contribution growth, in percent; applied at the start of each year. */
  contributionGrowth?: number;
  /** Effective annual inflation, in percent; if given, each point carries `realValue` (today's purchasing power). */
  inflationRate?: number;
}

export interface ProjectionPoint {
  year: number;
  contributed: number;
  interest: number;
  value: number;
  realValue: number;
}

export interface ProjectionResult {
  series: ProjectionPoint[];
  finalValue: number;
  totalContributed: number;
  totalInterest: number;
  finalRealValue: number;
}

/**
 * Per-period rate equivalent to an effective annual rate: (1 + r)^(1/n) − 1. With r ≤ −100% the value
 * is wiped out within a year (−100% per period) instead of giving NaN, as the `inputs.ts` policy
 * requires.
 */
export function periodRateFromEffective(effectiveAnnualPercent: number, periodsPerYear: number): number {
  return Math.pow(Math.max(0, 1 + effectiveAnnualPercent / 100), 1 / periodsPerYear) - 1;
}

/** Effective annual rate (in percent) of a nominal rate compounded `compoundingPeriods` times a year. */
function effectiveFromNominal(nominalPercent: number, compoundingPeriods: number): number {
  return (Math.pow(Math.max(0, 1 + nominalPercent / 100 / compoundingPeriods), compoundingPeriods) - 1) * 100;
}

/**
 * Two independent frequencies: `compounding` decides how much the money earns (how often interest
 * is compounded) and `frequency` only when contributions are made (at the end of each period). With
 * a 0 contribution the result depends on `compounding` but NOT on `frequency`: compounding used to be
 * tied to the contribution frequency, and €10,000 at 7% gave €10,722.90 with monthly contributions
 * and €10,700 with annual ones. The nominal rate with `compounding` is turned into its effective
 * annual rate, and the rate of each contribution period is derived from it, (1 + ef)^(1/n) − 1.
 * Inflation is always effective annual.
 */
export function project(input: ProjectionInput): ProjectionResult {
  const initial = Math.max(0, input.initial || 0);
  const years = clampYears(input.years);
  const periodsPerYear = PERIODS_PER_YEAR[input.frequency];
  const compoundingPeriods = PERIODS_PER_YEAR[input.compounding ?? "annual"];
  const netAnnualRate = (input.annualRate || 0) - Math.max(0, input.annualFee || 0);
  const periodRate = periodRateFromEffective(effectiveFromNominal(netAnnualRate, compoundingPeriods), periodsPerYear);
  const growth = Math.max(0, input.contributionGrowth || 0) / 100;
  // Inflation compounds the same way as the return: if the net return equals inflation, the real value stays constant
  const inflationPeriodRate = periodRateFromEffective(Math.max(0, input.inflationRate || 0), periodsPerYear);

  const series: ProjectionPoint[] = [
    { year: 0, contributed: initial, interest: 0, value: initial, realValue: initial },
  ];

  let value = initial;
  let contributed = initial;
  let contribution = Math.max(0, input.contribution || 0);
  let realDivisor = 1;
  const totalPeriods = years * periodsPerYear;

  for (let period = 1; period <= totalPeriods; period++) {
    value = value * (1 + periodRate) + contribution;
    contributed += contribution;
    realDivisor *= 1 + inflationPeriodRate;

    if (period % periodsPerYear === 0) {
      series.push({
        year: period / periodsPerYear,
        contributed,
        interest: value - contributed,
        value,
        realValue: value / realDivisor,
      });
      contribution *= 1 + growth;
    }
  }

  return {
    series,
    finalValue: value,
    totalContributed: contributed,
    totalInterest: value - contributed,
    finalRealValue: value / realDivisor,
  };
}
