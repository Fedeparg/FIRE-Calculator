import { describe, expect, it } from "vitest";
import { computeFire } from "./fire.js";
import {
  HISTORICAL_BLOCK_YEARS,
  simulateFire,
  withdrawalSensitivity,
  type MonteCarloInput,
} from "./fire-montecarlo.js";
import { HISTORICAL_RETURNS } from "../data/shiller-returns.js";
import { mulberry32, normalGenerator } from "../random.js";
import { firstItem, itemAt } from "../arrays.js";

// UI defaults (MonteCarloCalculator).
const base: MonteCarloInput = {
  annualExpenses: 24000,
  currentSavings: 20000,
  monthlySavings: 800,
  annualReturn: 5,
  volatility: 15,
  withdrawalRate: 4,
  retirementYears: 40,
};

// Fewer paths in tests that do not measure statistical precision: faster, just as deterministic.
const fast = { paths: 1000 };

describe("simulateFire", () => {
  it("FIRE number = expenses / withdrawal rate (4% rule → 25x)", () => {
    expect(simulateFire(base, fast).fireNumber).toBeCloseTo(600_000);
  });

  it("is deterministic: same seed, same result", () => {
    const a = simulateFire(base, fast);
    const b = simulateFire(base, fast);
    expect(a).toEqual(b);
  });

  it("different seeds give different but close results", () => {
    const a = simulateFire(base, { paths: 3000, seed: 1 });
    const b = simulateFire(base, { paths: 3000, seed: 2 });
    expect(a.successRate).not.toBe(b.successRate);
    expect(Math.abs(a.successRate - b.successRate)).toBeLessThan(0.05);
  });

  it("zero volatility: all paths are equal and it matches the annual FIRE calculator", () => {
    const result = simulateFire({ ...base, volatility: 0 }, fast);
    const fire = computeFire({
      annualExpenses: 24000,
      currentSavings: 20000,
      savings: 800 * 12,
      frequency: "annual",
      annualReturn: 5,
      withdrawalRate: 4,
    });
    expect(result.yearsToFire.p10).toBe(fire.yearsToFire);
    expect(result.yearsToFire.p50).toBe(fire.yearsToFire);
    expect(result.yearsToFire.p90).toBe(fire.yearsToFire);
    expect(result.deterministicYearsToFire).toBe(fire.yearsToFire);
    // Withdrawing 4% with a constant 5% real return, the money never runs out.
    expect(result.successRate).toBe(1);
    for (const point of result.series) {
      expect(point.p10).toBeCloseTo(point.deterministic, 6);
      expect(point.p90).toBeCloseTo(point.deterministic, 6);
    }
  });

  it("zero volatility with an unsustainable withdrawal → 0% success", () => {
    // A 10% withdrawal rate with a zero return: the money lasts 10 years, not 40.
    const result = simulateFire({ ...base, volatility: 0, annualReturn: 0, withdrawalRate: 10 }, fast);
    expect(result.reachRate).toBe(1);
    expect(result.successRate).toBe(0);
    expect(result.survivalRate).toBe(0);
  });

  it("zero expenses: already free (year 0) and success is 100%", () => {
    const result = simulateFire({ ...base, annualExpenses: 0 }, fast);
    expect(result.fireNumber).toBe(0);
    expect(result.yearsToFire).toEqual({ p10: 0, p50: 0, p90: 0 });
    expect(result.successRate).toBe(1);
  });

  it("wealth ≥ FIRE number: retires in year 0", () => {
    const result = simulateFire({ ...base, currentSavings: 1_000_000 }, fast);
    expect(result.reachRate).toBe(1);
    expect(result.yearsToFire.p50).toBe(0);
  });

  it("without savings or return FIRE is never reached: null years and 0% success", () => {
    const result = simulateFire({ ...base, monthlySavings: 0, annualReturn: 0, volatility: 0 }, fast);
    expect(result.reachRate).toBe(0);
    expect(result.successRate).toBe(0);
    expect(result.survivalRate).toBeNaN();
    expect(result.yearsToFire).toEqual({ p10: null, p50: null, p90: null });
    expect(result.deterministicYearsToFire).toBeNull();
  });

  it("0 retirement years: every path that gets there counts as a success", () => {
    const result = simulateFire({ ...base, retirementYears: 0 }, fast);
    expect(result.successRate).toBe(result.reachRate);
    expect(result.survivalRate).toBe(1);
  });

  it("sanitizes non-finite or negative inputs", () => {
    const result = simulateFire(
      {
        annualExpenses: Number.NaN,
        currentSavings: -5000,
        monthlySavings: Number.POSITIVE_INFINITY,
        annualReturn: Number.NaN,
        volatility: -10,
        withdrawalRate: 0,
        retirementYears: Number.NaN,
      },
      fast,
    );
    expect(result.fireNumber).toBe(0);
    expect(result.successRate).toBe(1);
    for (const point of result.series) {
      for (const key of ["p10", "p50", "p90", "deterministic"] as const) {
        expect(Number.isFinite(point[key])).toBe(true);
      }
    }
  });

  it("extreme volatility: no negative or non-finite values", () => {
    const result = simulateFire({ ...base, volatility: 500 }, fast);
    expect(result.successRate).toBeGreaterThanOrEqual(0);
    expect(result.successRate).toBeLessThanOrEqual(1);
    for (const point of result.series) {
      expect(point.p10).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(point.p90)).toBe(true);
    }
  });

  it("more volatility → lower probability of success", () => {
    const calm = simulateFire({ ...base, volatility: 5 });
    const wild = simulateFire({ ...base, volatility: 25 });
    expect(wild.successRate).toBeLessThan(calm.successRate);
  });

  it("more retirement years → lower (or equal) probability of success", () => {
    const short = simulateFire({ ...base, retirementYears: 20 });
    const long = simulateFire({ ...base, retirementYears: 50 });
    expect(long.successRate).toBeLessThanOrEqual(short.successRate);
    expect(long.reachRate).toBe(short.reachRate);
  });

  it("wealth percentiles are ordered every year", () => {
    for (const p of simulateFire(base, fast).series) {
      expect(p.p10).toBeLessThanOrEqual(p.p25);
      expect(p.p25).toBeLessThanOrEqual(p.p50);
      expect(p.p50).toBeLessThanOrEqual(p.p75);
      expect(p.p75).toBeLessThanOrEqual(p.p90);
      expect(p.target).toBe(600_000);
    }
  });

  it("the chart reaches the median FIRE year plus the retirement years", () => {
    const result = simulateFire(base, fast);
    const last = result.series.at(-1);
    expect(last?.year).toBe((result.yearsToFire.p50 ?? 0) + base.retirementYears);
  });

  it("the lognormal preserves the arithmetic mean: E[1 + r] ≈ 1 + μ", () => {
    // Same parameterization as the simulator, checked independently.
    const mu = 0.05;
    const sigma = 0.15;
    const v = Math.log(1 + (sigma * sigma) / ((1 + mu) * (1 + mu)));
    const m = Math.log(1 + mu) - v / 2;
    const normal = normalGenerator(mulberry32(3));
    const n = 200_000;
    let sum = 0;
    let sumSq = 0;
    for (let i = 0; i < n; i++) {
      const r = Math.exp(m + Math.sqrt(v) * normal()) - 1;
      expect(r).toBeGreaterThan(-1);
      sum += r;
      sumSq += r * r;
    }
    const mean = sum / n;
    expect(mean).toBeCloseTo(mu, 2);
    expect(Math.sqrt(sumSq / n - mean * mean)).toBeCloseTo(sigma, 2);
  });

  it("reference value with the defaults (fixed seed)", () => {
    const result = simulateFire(base);
    // 28 rather than 27 as in the FIRE calculator: here savings are contributed once a year.
    expect(result.deterministicYearsToFire).toBe(28);
    expect(result.yearsToFire).toMatchInlineSnapshot(`
      {
        "p10": 21,
        "p50": 29,
        "p90": 41,
      }
    `);
    expect(Math.round(result.successRate * 1000) / 1000).toMatchInlineSnapshot(`0.709`);
    expect(Math.round(result.reachRate * 1000) / 1000).toMatchInlineSnapshot(`0.993`);
  });
});

describe("simulateFire — historical model", () => {
  const historical = (stockShare: number): MonteCarloInput => ({
    ...base,
    returnModel: { kind: "historical", stockShare },
  });

  it("is deterministic with the same seed", () => {
    expect(simulateFire(historical(60), fast)).toEqual(simulateFire(historical(60), fast));
  });

  it("ignores the typed-in return and volatility", () => {
    const a = simulateFire(historical(60), fast);
    const b = simulateFire({ ...historical(60), annualReturn: 12, volatility: 40 }, fast);
    expect(b).toEqual(a);
  });

  it("the deterministic reference uses the historical mean of the mix", () => {
    const stocks = HISTORICAL_RETURNS.reduce((sum, y) => sum + y.stocks, 0) / HISTORICAL_RETURNS.length;
    const result = simulateFire(historical(100), fast);
    const expected = computeFire({
      annualExpenses: base.annualExpenses,
      currentSavings: base.currentSavings,
      savings: base.monthlySavings * 12,
      frequency: "annual",
      annualReturn: stocks * 100,
      withdrawalRate: base.withdrawalRate,
    });
    expect(result.deterministicYearsToFire).toBe(expected.yearsToFire);
  });

  it("100% stocks gets there sooner than 100% bonds", () => {
    const stocks = simulateFire(historical(100), fast);
    const bonds = simulateFire(historical(0), fast);
    expect(stocks.yearsToFire.p50 ?? Infinity).toBeLessThan(bonds.yearsToFire.p50 ?? Infinity);
    expect(stocks.reachRate).toBeGreaterThanOrEqual(bonds.reachRate);
  });

  it("clamps the stock share to 0–100 and treats non-finite values as 0", () => {
    expect(simulateFire(historical(150), fast)).toEqual(simulateFire(historical(100), fast));
    expect(simulateFire(historical(-20), fast)).toEqual(simulateFire(historical(0), fast));
    expect(simulateFire(historical(Number.NaN), fast)).toEqual(simulateFire(historical(0), fast));
  });

  it("blocks walk consecutive years of the series", () => {
    // With a single path and no savings or spending, year-over-year wealth reveals the returns:
    // within each block they must be consecutive historical years.
    const result = simulateFire(
      { ...historical(100), annualExpenses: 1e12, currentSavings: 1, monthlySavings: 0, retirementYears: 0 },
      { paths: 1 },
    );
    const returns = result.series.slice(1).map((p, i) => p.p50 / itemAt(result.series, i).p50 - 1);
    const index = HISTORICAL_RETURNS.findIndex((y) => Math.abs(y.stocks - itemAt(returns, 0)) < 1e-12);
    expect(index).toBeGreaterThanOrEqual(0);
    for (let k = 1; k < HISTORICAL_BLOCK_YEARS; k++) {
      const expected = itemAt(HISTORICAL_RETURNS, (index + k) % HISTORICAL_RETURNS.length).stocks;
      expect(returns[k]).toBeCloseTo(expected, 12);
    }
  });

  it("produces no non-finite values", () => {
    const result = simulateFire(historical(60), fast);
    for (const point of result.series) {
      for (const key of ["p10", "p25", "p50", "p75", "p90", "deterministic"] as const) {
        expect(Number.isFinite(point[key])).toBe(true);
      }
    }
  });
});

describe("withdrawalSensitivity", () => {
  it("returns one row per rate, with its FIRE number", () => {
    const rows = withdrawalSensitivity(base, [3, 4, 5], fast);
    expect(rows.map((r) => r.rate)).toEqual([3, 4, 5]);
    expect(itemAt(rows, 0).fireNumber).toBeCloseTo(800_000);
    expect(itemAt(rows, 1).fireNumber).toBeCloseTo(600_000);
  });

  it("each row matches simulating that rate on its own", () => {
    const row = firstItem(withdrawalSensitivity(base, [3.5], fast));
    expect(row.successRate).toBe(simulateFire({ ...base, withdrawalRate: 3.5 }, fast).successRate);
  });

  it("with a long retirement, withdrawing more lowers the probability of success", () => {
    const rows = withdrawalSensitivity({ ...base, retirementYears: 50 }, [3, 4, 5, 6], fast);
    for (let i = 1; i < rows.length; i++) {
      expect(itemAt(rows, i).successRate).toBeLessThanOrEqual(itemAt(rows, i - 1).successRate);
    }
  });

  it("also works with the historical model", () => {
    const rows = withdrawalSensitivity(
      { ...base, returnModel: { kind: "historical", stockShare: 60 } },
      undefined,
      fast,
    );
    expect(rows).toHaveLength(5);
    rows.forEach((r) => {
      expect(r.successRate).toBeGreaterThanOrEqual(0);
      expect(r.successRate).toBeLessThanOrEqual(1);
    });
  });
});
