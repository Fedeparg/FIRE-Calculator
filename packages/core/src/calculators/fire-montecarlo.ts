// FIRE Monte Carlo simulator. Each life follows a random sequence of annual returns and the result
// is a probability, not a single date. Two phases in real terms with annual steps:
//   1. Accumulation: W = W·(1+r) + savings, until the FIRE number (at most `FIRE_SEARCH_MAX_YEARS`).
//   2. Retirement: spending is withdrawn at the start of each year, W = (W − spending)·(1+r); if the
//      money runs out within `retirementYears`, the life fails.
//
// Lognormal: 1 + r = exp(m + s·Z), Z ~ N(0, 1), with E[1 + r] = 1 + μ and standard deviation σ; it
// never loses more than 100%. With σ = 0 it matches the FIRE calculator at annual frequency.
//
// Historical (optional): circular block bootstrap over blocks of `HISTORICAL_BLOCK_YEARS` real US years
// (Shiller); the blocks preserve streaks (1929-1932, 1973-1974…) and with them sequence-of-returns
// risk. The stock/bond mix is rebalanced every year.

import { itemAt } from "../arrays.js";
import { finiteOr, nonNegative } from "../inputs.js";
import { computeFire, FIRE_SEARCH_MAX_YEARS } from "./fire.js";
import { HISTORICAL_RETURNS } from "../data/shiller-returns.js";
import { mulberry32, normalGenerator, percentileSorted, type Rng } from "../random.js";

/**
 * How returns are generated. `lognormal`: mean `annualReturn` and volatility `volatility`
 * (the default). `historical`: resampled real years; `stockShare` is the % in stocks (base 100),
 * the rest in bonds, and it ignores `annualReturn` and `volatility`.
 */
export type ReturnModel = { kind: "lognormal" } | { kind: "historical"; stockShare: number };

export interface MonteCarloInput {
  annualExpenses: number;
  currentSavings: number;
  /** Monthly savings until FIRE; contributed as a lump sum at the end of each year. */
  monthlySavings: number;
  annualReturn: number;
  volatility: number;
  withdrawalRate: number;
  retirementYears: number;
  returnModel?: ReturnModel;
}

export interface MonteCarloOptions {
  paths?: number;
  /** Seed: the same seed always gives the same result. */
  seed?: number;
}

export interface YearsPercentiles {
  p10: number | null;
  p50: number | null;
  p90: number | null;
}

export interface MonteCarloPoint {
  year: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  deterministic: number;
  target: number;
}

export interface MonteCarloResult {
  fireNumber: number;
  successRate: number;
  reachRate: number;
  survivalRate: number;
  yearsToFire: YearsPercentiles;
  deterministicYearsToFire: number | null;
  series: MonteCarloPoint[];
}

export const DEFAULT_PATHS = 5000;
export const DEFAULT_SEED = 42;
export const MAX_RETIREMENT_YEARS = 60;
export const MAX_VOLATILITY = 100;
/** Floor for the mean return, base 100 (1 + μ must be positive). */
const MIN_RETURN = -99;
export const HISTORICAL_BLOCK_YEARS = 10;
export const SENSITIVITY_RATES: readonly number[] = [3, 3.5, 4, 4.5, 5];

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

interface PathState {
  wealth: number;
  retiredAt: number | null;
  depletedAt: number | null;
}

/**
 * Advances a life by one year at return `r` (mutates `state`); shared by the random lives and the
 * deterministic one so they follow the same rules.
 */
function step(
  state: PathState,
  year: number,
  r: number,
  params: { annualSavings: number; annualExpenses: number; fireNumber: number },
): void {
  if (state.retiredAt === null) {
    state.wealth = state.wealth * (1 + r) + params.annualSavings;
    if (year <= FIRE_SEARCH_MAX_YEARS && state.wealth >= params.fireNumber) state.retiredAt = year;
    return;
  }
  if (state.depletedAt !== null) return;
  if (state.wealth < params.annualExpenses) {
    state.wealth = 0;
    state.depletedAt = year;
    return;
  }
  state.wealth = (state.wealth - params.annualExpenses) * (1 + r);
}

export function simulateFire(input: MonteCarloInput, options: MonteCarloOptions = {}): MonteCarloResult {
  const paths = Math.max(1, Math.round(options.paths ?? DEFAULT_PATHS));
  const seed = options.seed ?? DEFAULT_SEED;

  const annualExpenses = nonNegative(input.annualExpenses);
  const currentSavings = nonNegative(input.currentSavings);
  const annualSavings = nonNegative(input.monthlySavings) * 12;
  const retirementYears = clamp(Math.round(nonNegative(input.retirementYears)), 0, MAX_RETIREMENT_YEARS);

  const model = input.returnModel ?? { kind: "lognormal" };
  const historical = model.kind === "historical" ? blendHistorical(model.stockShare) : null;
  // Mean: the user's input for lognormal, the blend's historical mean for historical; the deterministic
  // reference uses it.
  const mean = historical ? historical.mean : clamp(finiteOr(input.annualReturn, 0), MIN_RETURN, Infinity) / 100;
  const sigma = clamp(nonNegative(input.volatility), 0, MAX_VOLATILITY) / 100;

  // FIRE at annual frequency so the contribution rules match this simulator's
  const fire = computeFire({
    annualExpenses,
    currentSavings,
    savings: annualSavings,
    frequency: "annual",
    annualReturn: mean * 100,
    withdrawalRate: input.withdrawalRate,
  });
  const fireNumber = fire.fireNumber;
  const params = { annualSavings, annualExpenses, fireNumber };

  const horizon = FIRE_SEARCH_MAX_YEARS + retirementYears;
  // every life always consumes the same number of returns: changing the retirement years does not reshuffle
  // the randomness, so scenarios stay comparable
  const drawsPerPath = FIRE_SEARCH_MAX_YEARS + MAX_RETIREMENT_YEARS;
  const returns = new Float64Array(drawsPerPath);
  const drawPath = historical
    ? historicalSampler(historical.returns, mulberry32(seed))
    : lognormalSampler(mean, sigma, mulberry32(seed));
  // wealthByYear[year][path]: each year is sorted to extract percentiles
  const wealthByYear = Array.from({ length: horizon + 1 }, () => new Float64Array(paths));
  const yearsToFire = new Float64Array(paths);

  let reached = 0;
  let succeeded = 0;

  for (let path = 0; path < paths; path++) {
    const state: PathState = {
      wealth: currentSavings,
      retiredAt: currentSavings >= fireNumber ? 0 : null,
      depletedAt: null,
    };
    itemAt(wealthByYear, 0)[path] = state.wealth;
    drawPath(returns);
    for (let year = 1; year <= horizon; year++) {
      step(state, year, itemAt(returns, year - 1), params);
      itemAt(wealthByYear, year)[path] = state.wealth;
    }

    yearsToFire[path] = state.retiredAt ?? Infinity;
    if (state.retiredAt !== null) {
      reached++;
      const survived = state.depletedAt === null || state.depletedAt > state.retiredAt + retirementYears;
      if (survived) succeeded++;
    }
  }

  // deterministic: same rules with a constant return
  const reference: PathState = {
    wealth: currentSavings,
    retiredAt: currentSavings >= fireNumber ? 0 : null,
    depletedAt: null,
  };
  const deterministicByYear = [reference.wealth];
  for (let year = 1; year <= horizon; year++) {
    step(reference, year, mean, params);
    deterministicByYear.push(reference.wealth);
  }

  yearsToFire.sort();
  const yearsAt = (p: number): number | null => {
    const value = percentileSorted(yearsToFire, p);
    return Number.isFinite(value) ? Math.round(value) : null;
  };
  const yearsPercentiles: YearsPercentiles = { p10: yearsAt(10), p50: yearsAt(50), p90: yearsAt(90) };

  // the chart covers the median life: until it reaches FIRE plus the retirement years
  const chartEnd = Math.min(horizon, (yearsPercentiles.p50 ?? FIRE_SEARCH_MAX_YEARS) + retirementYears);
  const series: MonteCarloPoint[] = [];
  for (let year = 0; year <= chartEnd; year++) {
    const sorted = itemAt(wealthByYear, year).sort();
    series.push({
      year,
      p10: percentileSorted(sorted, 10),
      p25: percentileSorted(sorted, 25),
      p50: percentileSorted(sorted, 50),
      p75: percentileSorted(sorted, 75),
      p90: percentileSorted(sorted, 90),
      deterministic: itemAt(deterministicByYear, year),
      target: fireNumber,
    });
  }

  return {
    fireNumber,
    successRate: succeeded / paths,
    reachRate: reached / paths,
    survivalRate: reached === 0 ? NaN : succeeded / reached,
    yearsToFire: yearsPercentiles,
    deterministicYearsToFire: fire.yearsToFire,
    series,
  };
}

/**
 * Lognormal sequence for one life; always consumes `out.length` normals so that life i sees the same
 * market (see `drawsPerPath`).
 */
function lognormalSampler(mean: number, sigma: number, rng: Rng): (out: Float64Array) => void {
  // lognormal parameters from the arithmetic mean and the volatility
  const logVariance = Math.log(1 + (sigma * sigma) / ((1 + mean) * (1 + mean)));
  const logSigma = Math.sqrt(logVariance);
  const logMean = Math.log(1 + mean) - logVariance / 2;
  const normal = normalGenerator(rng);
  return (out) => {
    for (let i = 0; i < out.length; i++) {
      const z = normal();
      // with σ = 0 the exact mean is used: exp(log(1+μ)) − 1 does not always return μ bit for bit
      out[i] = logSigma === 0 ? mean : Math.exp(logMean + logSigma * z) - 1;
    }
  };
}

/**
 * Circular block bootstrap: each block starts at a random year and continues in order. Consumes one
 * random number per block, for the same reason as the lognormal sampler.
 */
function historicalSampler(series: readonly number[], rng: Rng): (out: Float64Array) => void {
  const n = series.length;
  return (out) => {
    for (let i = 0; i < out.length; i += HISTORICAL_BLOCK_YEARS) {
      const start = Math.floor(rng() * n);
      const end = Math.min(out.length, i + HISTORICAL_BLOCK_YEARS);
      for (let k = i; k < end; k++) out[k] = itemAt(series, (start + k - i) % n);
    }
  };
}

/**
 * Historical series with `stockShare` % in stocks and the rest in bonds, rebalanced every year, plus
 * its mean; a non-finite percentage counts as 0, clamped to 0–100.
 */
function blendHistorical(stockShare: number): { returns: number[]; mean: number } {
  const share = clamp(finiteOr(stockShare, 0), 0, 100) / 100;
  const returns = HISTORICAL_RETURNS.map((y) => share * y.stocks + (1 - share) * y.bonds);
  const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  return { returns, mean };
}

export interface SensitivityRow {
  rate: number;
  fireNumber: number;
  successRate: number;
}

/**
 * Success probability for several withdrawal rates. Same seed in every row: the differences come
 * from the rate, not from chance (a high rate means a lower target but a harder retirement).
 */
export function withdrawalSensitivity(
  input: MonteCarloInput,
  rates: readonly number[] = SENSITIVITY_RATES,
  options: MonteCarloOptions = {},
): SensitivityRow[] {
  return rates.map((rate) => {
    const result = simulateFire({ ...input, withdrawalRate: rate }, options);
    return { rate, fireNumber: result.fireNumber, successRate: result.successRate };
  });
}
