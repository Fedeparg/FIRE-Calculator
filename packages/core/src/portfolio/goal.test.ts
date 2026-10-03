import { describe, expect, it } from "vitest";

import {
  computeAmountGoal,
  computeGoalProgress,
  computePortfolioGoal,
  goalModeFromInputs,
  monthlyContribution,
  resolveGoalTarget,
  simulatePortfolioGoal,
  type PortfolioGoalInput,
} from "./goal.js";
import { itemAt } from "../arrays.js";

/** Typical goal: €24,000/year at 4% → €600,000 target net worth. */
const BASE: PortfolioGoalInput = {
  annualExpenses: 24000,
  withdrawalRate: 4,
  currentValue: 150000,
  contribution: 1000,
  frequency: "monthly",
  annualReturn: 5,
};

describe("computePortfolioGoal", () => {
  it("computes target, progress and what is left from the real net worth", () => {
    const result = computePortfolioGoal(BASE);

    expect(result.target).toBe(600000);
    expect(result.current).toBe(150000);
    expect(result.progress).toBeCloseTo(25, 10);
    expect(result.remaining).toBe(450000);
    expect(result.reached).toBe(false);
  });

  it("estimates the years left at the current contribution pace", () => {
    const result = computePortfolioGoal(BASE);

    // Consistent with the FIRE calculator: 150k + €1,000/month at 5% takes 16 years to reach
    // 600k (same projection, same engine).
    expect(result.yearsToTarget).toBe(16);
  });

  it("returns null when the target is not reached within the projected horizon", () => {
    const result = computePortfolioGoal({ ...BASE, contribution: 0, annualReturn: 0 });

    expect(result.yearsToTarget).toBeNull();
    expect(result.reached).toBe(false);
  });

  it("marks the target as reached and caps progress at 100%", () => {
    const result = computePortfolioGoal({ ...BASE, currentValue: 900000 });

    expect(result.reached).toBe(true);
    expect(result.progress).toBe(100);
    expect(result.remaining).toBe(0);
    expect(result.yearsToTarget).toBe(0);
  });

  it("empty portfolio: progress 0 and the whole target is left", () => {
    const result = computePortfolioGoal({ ...BASE, currentValue: 0 });

    expect(result.current).toBe(0);
    expect(result.progress).toBe(0);
    expect(result.remaining).toBe(600000);
    expect(result.reached).toBe(false);
  });

  it("zero annual spending: target 0, reached and no representable percentage", () => {
    const result = computePortfolioGoal({ ...BASE, annualExpenses: 0, currentValue: 0 });

    expect(result.target).toBe(0);
    expect(result.progress).toBeNull();
    expect(result.remaining).toBe(0);
    expect(result.reached).toBe(true);
    expect(result.yearsToTarget).toBe(0);
  });

  it("zero withdrawal rate: inherits the FIRE calculator's 4% default", () => {
    const zero = computePortfolioGoal({ ...BASE, withdrawalRate: 0 });
    const four = computePortfolioGoal({ ...BASE, withdrawalRate: 4 });

    expect(zero.target).toBe(four.target);
  });

  it("a high withdrawal rate lowers the target", () => {
    const result = computePortfolioGoal({ ...BASE, withdrawalRate: 8 });

    expect(result.target).toBe(300000);
  });

  it("does not leak non-finite values from corrupt inputs", () => {
    const result = computePortfolioGoal({
      annualExpenses: Number.NaN,
      withdrawalRate: Number.NaN,
      currentValue: Number.POSITIVE_INFINITY,
      contribution: Number.NaN,
      frequency: "monthly",
      annualReturn: Number.NaN,
    });

    expect(Number.isFinite(result.target)).toBe(true);
    expect(Number.isFinite(result.current)).toBe(true);
    expect(Number.isFinite(result.remaining)).toBe(true);
    expect(result.current).toBe(0);
  });

  it("a negative net worth is treated as an empty portfolio", () => {
    const result = computePortfolioGoal({ ...BASE, currentValue: -5000 });

    expect(result.current).toBe(0);
    expect(result.progress).toBe(0);
  });
});

describe("monthlyContribution", () => {
  it("preserves the contribution's annual total", () => {
    expect(monthlyContribution(1000, "monthly")).toBe(1000);
    expect(monthlyContribution(12000, "annual")).toBe(1000);
    expect(monthlyContribution(3000, "quarterly")).toBe(1000);
    expect(monthlyContribution(100, "weekly")).toBeCloseTo(5200 / 12, 10);
  });
});

describe("simulatePortfolioGoal", () => {
  const SIM = { ...BASE, frequency: "annual" as const, contribution: 12000, volatility: 15, retirementYears: 40 };

  it("without volatility it matches the deterministic goal at annual frequency", () => {
    const deterministic = computePortfolioGoal(SIM);
    const simulated = simulatePortfolioGoal({ ...SIM, volatility: 0 }, { paths: 50 });

    expect(simulated.fireNumber).toBe(deterministic.target);
    expect(simulated.yearsToFire.p50).toBe(deterministic.yearsToTarget);
    expect(simulated.reachRate).toBe(1);
  });

  it("uses the real market value as the starting net worth", () => {
    const result = simulatePortfolioGoal(SIM, { paths: 200 });

    expect(itemAt(result.series, 0).p50).toBe(150000);
  });

  it("a portfolio that already covers the target starts retired", () => {
    const result = simulatePortfolioGoal({ ...SIM, currentValue: 900000 }, { paths: 200 });

    expect(result.reachRate).toBe(1);
    expect(result.yearsToFire.p50).toBe(0);
  });

  it("an empty or non-finite portfolio is treated as 0 and produces no NaN", () => {
    const empty = simulatePortfolioGoal({ ...SIM, currentValue: Number.NaN }, { paths: 200 });

    expect(itemAt(empty.series, 0).p50).toBe(0);
    expect(Number.isFinite(empty.successRate)).toBe(true);
  });

  it("with no contribution and no return the target is never reached", () => {
    const result = simulatePortfolioGoal({ ...SIM, contribution: 0, annualReturn: 0, volatility: 0 }, { paths: 50 });

    expect(result.reachRate).toBe(0);
    expect(result.successRate).toBe(0);
  });

  it("a monthly contribution is equivalent to an annual one with the same total", () => {
    const annual = simulatePortfolioGoal(SIM, { paths: 300 });
    const monthly = simulatePortfolioGoal({ ...SIM, frequency: "monthly", contribution: 1000 }, { paths: 300 });

    expect(monthly.successRate).toBe(annual.successRate);
  });
});

describe("goalModeFromInputs", () => {
  it("reads amount mode and treats anything else (or its absence) as FIRE", () => {
    expect(goalModeFromInputs({ goalMode: "amount" })).toBe("amount");
    expect(goalModeFromInputs({ goalMode: "fire" })).toBe("fire");
    expect(goalModeFromInputs({ goalMode: "other" })).toBe("fire");
    expect(goalModeFromInputs({})).toBe("fire");
    expect(goalModeFromInputs(null)).toBe("fire");
  });
});

describe("computeAmountGoal", () => {
  const AMOUNT = {
    targetAmount: 100000,
    years: 10,
    currentValue: 20000,
    contribution: 500,
    frequency: "monthly" as const,
    annualReturn: 5,
  };

  it("the required contribution lands exactly on the target at the deadline", () => {
    const result = computeAmountGoal(AMOUNT);
    expect(result.requiredContribution).not.toBeNull();
    const again = computeAmountGoal({ ...AMOUNT, contribution: result.requiredContribution ?? 0 });
    expect(again.projectedAtDeadline).toBeCloseTo(100000, 4);
    expect(again.onTrack).toBe(true);
  });

  it("is on track when the projection at the deadline exceeds the target", () => {
    const result = computeAmountGoal(AMOUNT);
    // €20,000 + €500/month at 5% for 10 years ≈ €110,600.
    expect(result.projectedAtDeadline).toBeGreaterThan(100000);
    expect(result.onTrack).toBe(true);
    expect(result.requiredContribution).toBeLessThan(500);
    expect(result.yearsToTarget).toBeLessThanOrEqual(10);
    expect(result.progress).toBeCloseTo(20, 10);
  });

  it("falls short with an insufficient contribution", () => {
    const result = computeAmountGoal({ ...AMOUNT, contribution: 100 });
    expect(result.onTrack).toBe(false);
    expect(result.requiredContribution).toBeGreaterThan(100);
  });

  it("with a 0 return it spreads what is left across the periods", () => {
    const result = computeAmountGoal({ ...AMOUNT, annualReturn: 0 });
    expect(result.requiredContribution).toBeCloseTo(80000 / 120, 10);
    expect(result.projectedAtDeadline).toBeCloseTo(20000 + 500 * 120, 6);
  });

  it("deadline 0 without having arrived: no contribution is possible", () => {
    const result = computeAmountGoal({ ...AMOUNT, years: 0 });
    expect(result.deadlineYears).toBe(0);
    expect(result.requiredContribution).toBeNull();
    expect(result.projectedAtDeadline).toBe(20000);
    expect(result.onTrack).toBe(false);
  });

  it("already reached: nothing to contribute, even with a deadline of 0", () => {
    const result = computeAmountGoal({ ...AMOUNT, currentValue: 150000, years: 0 });
    expect(result.reached).toBe(true);
    expect(result.requiredContribution).toBe(0);
    expect(result.yearsToTarget).toBe(0);
    expect(result.progress).toBe(100);
    expect(result.onTrack).toBe(true);
  });

  it("if the capital's growth suffices, the required contribution is 0", () => {
    const result = computeAmountGoal({ ...AMOUNT, currentValue: 70000, contribution: 0 });
    expect(result.requiredContribution).toBe(0);
    expect(result.onTrack).toBe(true);
  });

  it("with a negative return the required contribution goes up", () => {
    const flat = computeAmountGoal({ ...AMOUNT, annualReturn: 0 });
    const negative = computeAmountGoal({ ...AMOUNT, annualReturn: -3 });
    expect(negative.requiredContribution).toBeGreaterThan(flat.requiredContribution ?? 0);
  });

  it("rounds the deadline to whole years and treats invalid inputs as 0", () => {
    expect(computeAmountGoal({ ...AMOUNT, years: 9.6 }).deadlineYears).toBe(10);
    expect(computeAmountGoal({ ...AMOUNT, years: Number.NaN }).deadlineYears).toBe(0);
    const empty = computeAmountGoal({ ...AMOUNT, targetAmount: -5 });
    expect(empty.target).toBe(0);
    expect(empty.reached).toBe(true);
    expect(empty.progress).toBeNull();
  });

  it("when not reached within 60 years, yearsToTarget is null", () => {
    const result = computeAmountGoal({ ...AMOUNT, targetAmount: 1e12, contribution: 0, annualReturn: 0 });
    expect(result.yearsToTarget).toBeNull();
  });
});

describe("computeGoalProgress", () => {
  const COMMON = { currentValue: 150000, contribution: 1000, frequency: "monthly", annualReturn: 5 } as const;

  it("FIRE mode: equals computePortfolioGoal tagged with its mode", () => {
    const outcome = computeGoalProgress({ mode: "fire", annualExpenses: 24000, withdrawalRate: 4 }, COMMON);
    expect(outcome).toEqual({ mode: "fire", ...computePortfolioGoal(BASE) });
  });

  it("amount mode: equals computeAmountGoal tagged with its mode", () => {
    const outcome = computeGoalProgress({ mode: "amount", targetAmount: 300000, targetYears: 10 }, COMMON);
    expect(outcome).toEqual({
      mode: "amount",
      ...computeAmountGoal({ ...COMMON, targetAmount: 300000, years: 10 }),
    });
  });

  it("target already reached: 0 years and nothing to contribute", () => {
    const fire = computeGoalProgress({ mode: "fire", annualExpenses: 4000, withdrawalRate: 4 }, COMMON);
    expect(fire).toMatchObject({ mode: "fire", reached: true, yearsToTarget: 0, remaining: 0 });
    const amount = computeGoalProgress({ mode: "amount", targetAmount: 100000, targetYears: 5 }, COMMON);
    expect(amount).toMatchObject({ mode: "amount", reached: true, requiredContribution: 0, onTrack: true });
  });

  it("0-year deadline: only on track if the amount is already there", () => {
    const outcome = computeGoalProgress({ mode: "amount", targetAmount: 200000, targetYears: 0 }, COMMON);
    expect(outcome).toMatchObject({ deadlineYears: 0, projectedAtDeadline: 150000, onTrack: false });
  });

  it("0 return: the required contribution is linear", () => {
    const outcome = computeGoalProgress(
      { mode: "amount", targetAmount: 250000, targetYears: 10 },
      { ...COMMON, annualReturn: 0 },
    );
    expect(outcome).toMatchObject({ mode: "amount", requiredContribution: 100000 / 120 });
  });
});

describe("resolveGoalTarget", () => {
  it("infers FIRE mode", () => {
    expect(resolveGoalTarget({ annualExpenses: 24000, withdrawalRate: 4 })).toEqual({
      target: { mode: "fire", annualExpenses: 24000, withdrawalRate: 4 },
    });
  });

  it("infers amount mode", () => {
    expect(resolveGoalTarget({ targetAmount: 1000, targetYears: 5 })).toEqual({
      target: { mode: "amount", targetAmount: 1000, targetYears: 5 },
    });
  });

  it("accepts zeros as present values", () => {
    expect(resolveGoalTarget({ targetAmount: 0, targetYears: 0 })).toEqual({
      target: { mode: "amount", targetAmount: 0, targetYears: 0 },
    });
  });

  it("rejects incomplete or mixed inputs", () => {
    expect(resolveGoalTarget({})).toEqual({ error: "fireIncomplete" });
    expect(resolveGoalTarget({ annualExpenses: 1 })).toEqual({ error: "fireIncomplete" });
    expect(resolveGoalTarget({ targetAmount: 1 })).toEqual({ error: "amountIncomplete" });
    expect(resolveGoalTarget({ targetYears: 1, annualExpenses: 1 })).toEqual({ error: "amountIncomplete" });
    expect(resolveGoalTarget({ targetAmount: 1, targetYears: 1, withdrawalRate: 4 })).toEqual({
      error: "mixedModes",
    });
  });
});
