/**
 * Bridge between the FIRE calculator and the real portfolio: target, current net worth and what is
 * left. Pure core. It reimplements nothing: it replaces the typed-in net worth with the market value
 * and derives the progress. Currency-agnostic: `annualExpenses`, `contribution` and `currentValue`
 * share one currency.
 */

import { finiteOr, nonNegative } from "../inputs.js";
import { computeFire, FIRE_SEARCH_MAX_YEARS } from "../calculators/fire.js";
import { simulateFire, type MonteCarloOptions, type MonteCarloResult } from "../calculators/fire-montecarlo.js";
import { PERIODS_PER_YEAR, periodRateFromEffective, project, type Frequency } from "../projection.js";

/** Slug of the FIRE calculator; saved scenarios share it with the portfolio goal. */
export const FIRE_CALCULATOR_SLUG = "independencia-financiera";

export interface PortfolioGoalInput {
  /** Estimated annual spending once financial independence is reached. */
  annualExpenses: number;
  /** Safe withdrawal rate, in base 100 (4 = the 4% rule). */
  withdrawalRate: number;
  /** Current market value of the portfolio (the same total the summary shows). */
  currentValue: number;
  /** Contribution per period used to estimate the remaining time. */
  contribution: number;
  /** Contribution frequency. */
  frequency: Frequency;
  /** Expected annual return, in base 100. */
  annualReturn: number;
}

export interface PortfolioGoalResult {
  /** Target net worth (FIRE number = annual spending / withdrawal rate). */
  target: number;
  /** Current net worth used in the comparison (already sanitized). */
  current: number;
  /** Completed percentage (0–100), or `null` if the target is not positive (the UI renders it as "—"). */
  progress: number | null;
  /** What is left to reach the target (0 if already reached). */
  remaining: number;
  /** Years to reach it with the current contribution; `0` if already there, `null` if not reached within 60 years. */
  yearsToTarget: number | null;
  /** Whether the current net worth already covers the target. */
  reached: boolean;
}

/**
 * Portfolio progress towards the FIRE target. Edge cases (tested): spending 0 → reached with
 * `progress` null; withdrawal rate <= 0 → inherits the 4% default from `computeFire`; non-finite
 * or negative net worth → 0.
 */
export function computePortfolioGoal(input: PortfolioGoalInput): PortfolioGoalResult {
  const current = Number.isFinite(input.currentValue) && input.currentValue > 0 ? input.currentValue : 0;

  const fire = computeFire({
    annualExpenses: input.annualExpenses,
    currentSavings: current,
    savings: input.contribution,
    frequency: input.frequency,
    annualReturn: input.annualReturn,
    withdrawalRate: input.withdrawalRate,
  });

  const target = fire.fireNumber;
  const reached = current >= target;
  const progress = Number.isFinite(target) && target > 0 ? Math.min(100, (current / target) * 100) : null;

  return {
    target,
    current,
    progress,
    remaining: Math.max(0, target - current),
    // keeps "reached" and "0 years" consistent
    yearsToTarget: reached ? 0 : fire.yearsToFire,
    reached,
  };
}

/** Mode of a saved goal: `fire` (live off the portfolio) or `amount` (save a sum within a deadline). */
export type GoalMode = "fire" | "amount";
export const GOAL_MODES: readonly GoalMode[] = ["fire", "amount"];

/** Mode of a scenario's `inputs`; without the key (older scenarios) it is `fire`. */
export function goalModeFromInputs(inputs: unknown): GoalMode {
  const mode = typeof inputs === "object" && inputs !== null && "goalMode" in inputs ? inputs.goalMode : undefined;
  return mode === "amount" ? "amount" : "fire";
}

export interface AmountGoalInput {
  /** Amount to save. */
  targetAmount: number;
  /** Deadline in whole years (rounded, as in `project`). */
  years: number;
  currentValue: number;
  /** Contribution per period (`frequency`). */
  contribution: number;
  frequency: Frequency;
  /** Expected annual return, in base 100. */
  annualReturn: number;
}

export interface AmountGoalResult extends PortfolioGoalResult {
  /** Deadline used, in whole years. */
  deadlineYears: number;
  /** Projected value at the deadline with the current contribution. */
  projectedAtDeadline: number;
  /** Contribution per period to get there just in time; 0 if already on course, `null` if impossible. */
  requiredContribution: number | null;
  /** Whether the current pace reaches the target within the deadline. */
  onTrack: boolean;
}

/**
 * "I want X in N years" goal, using the conventions of `project`. The required contribution solves
 * for P in `FV = C·(1+i)^n + P·((1+i)^n − 1) / i` (with i = 0, P·n).
 */
export function computeAmountGoal(input: AmountGoalInput): AmountGoalResult {
  const current = nonNegative(input.currentValue);
  const target = nonNegative(input.targetAmount);
  const deadlineYears = Math.max(0, Math.round(finiteOr(input.years, 0)));
  const reached = current >= target;

  const periodsPerYear = PERIODS_PER_YEAR[input.frequency];
  const periodRate = periodRateFromEffective(input.annualReturn || 0, periodsPerYear);
  const periods = deadlineYears * periodsPerYear;
  const growth = (1 + periodRate) ** periods;
  const annuity = periodRate === 0 ? periods : (growth - 1) / periodRate;

  const projection = project({
    initial: current,
    contribution: input.contribution,
    frequency: input.frequency,
    annualRate: input.annualReturn,
    years: Math.max(FIRE_SEARCH_MAX_YEARS, deadlineYears),
  });
  const projectedAtDeadline = projection.series[deadlineYears]?.value ?? current;
  const firstYear = projection.series.find((p) => p.year <= FIRE_SEARCH_MAX_YEARS && p.value >= target)?.year;

  let requiredContribution: number | null;
  if (reached || current * growth >= target) requiredContribution = 0;
  else if (annuity <= 0) requiredContribution = null;
  else requiredContribution = (target - current * growth) / annuity;
  if (requiredContribution !== null && !Number.isFinite(requiredContribution)) requiredContribution = null;

  return {
    target,
    current,
    progress: target > 0 ? Math.min(100, (current / target) * 100) : null,
    remaining: Math.max(0, target - current),
    yearsToTarget: reached ? 0 : (firstYear ?? null),
    reached,
    deadlineYears,
    projectedAtDeadline,
    requiredContribution,
    onTrack: reached || projectedAtDeadline >= target,
  };
}

/** Outcome of a goal, tagged with its mode so the renderer knows which fields it has. */
export type GoalOutcome = ({ mode: "fire" } & PortfolioGoalResult) | ({ mode: "amount" } & AmountGoalResult);

/** What is pursued: living off the portfolio (`fire`) or saving a sum within a deadline (`amount`). */
export type GoalTarget =
  | { mode: "fire"; annualExpenses: number; withdrawalRate: number }
  | { mode: "amount"; targetAmount: number; targetYears: number };

/** What both modes share: the starting portfolio and the savings pace. */
export type GoalProgressInput = Pick<
  PortfolioGoalInput,
  "currentValue" | "contribution" | "frequency" | "annualReturn"
>;

/**
 * Portfolio progress towards a goal in either mode: a single entry point for the web app and the
 * MCP, so both pick the mode and build the result the same way.
 */
export function computeGoalProgress(target: GoalTarget, input: GoalProgressInput): GoalOutcome {
  return target.mode === "amount"
    ? {
        mode: "amount",
        ...computeAmountGoal({ ...input, targetAmount: target.targetAmount, years: target.targetYears }),
      }
    : {
        mode: "fire",
        ...computePortfolioGoal({
          ...input,
          annualExpenses: target.annualExpenses,
          withdrawalRate: target.withdrawalRate,
        }),
      };
}

/** Goal fields as they arrive from a client: any of them may be missing. */
export interface RawGoalTarget {
  annualExpenses?: number;
  withdrawalRate?: number;
  targetAmount?: number;
  targetYears?: number;
}

export type GoalTargetError = "amountIncomplete" | "mixedModes" | "fireIncomplete";

/**
 * Infers the mode from optional fields and requires them to be consistent: any of the amount fields
 * forces amount mode, which rules out the FIRE ones. Returns an error code (not a message) so each
 * client can phrase it its own way.
 */
export function resolveGoalTarget(raw: RawGoalTarget): { target: GoalTarget } | { error: GoalTargetError } {
  const { annualExpenses, withdrawalRate, targetAmount, targetYears } = raw;
  if (targetAmount !== undefined || targetYears !== undefined) {
    if (targetAmount === undefined || targetYears === undefined) return { error: "amountIncomplete" };
    if (annualExpenses !== undefined || withdrawalRate !== undefined) return { error: "mixedModes" };
    return { target: { mode: "amount", targetAmount, targetYears } };
  }
  if (annualExpenses === undefined || withdrawalRate === undefined) return { error: "fireIncomplete" };
  return { target: { mode: "fire", annualExpenses, withdrawalRate } };
}

export interface PortfolioGoalSimulationInput extends PortfolioGoalInput {
  /** Annual portfolio volatility, in base 100 (15 = 15%). */
  volatility: number;
  /** Years the net worth must sustain the spending once the target is reached. */
  retirementYears: number;
}

/**
 * Contribution expressed as monthly savings (what the Monte Carlo simulator takes), preserving the
 * annual total. Also used by the "Open in the simulator" link.
 */
export function monthlyContribution(contribution: number, frequency: Frequency): number {
  const periodsPerYear = PERIODS_PER_YEAR[frequency];
  return (contribution * periodsPerYear) / 12;
}

/**
 * Probability of reaching and sustaining the target with the real net worth: `simulateFire` fed the
 * market value, with no second model. The simulator contributes at the end of each year, so it only
 * matches `computePortfolioGoal` at annual frequency.
 */
export function simulatePortfolioGoal(
  input: PortfolioGoalSimulationInput,
  options?: MonteCarloOptions,
): MonteCarloResult {
  const current = Number.isFinite(input.currentValue) && input.currentValue > 0 ? input.currentValue : 0;
  return simulateFire(
    {
      annualExpenses: input.annualExpenses,
      currentSavings: current,
      monthlySavings: monthlyContribution(input.contribution, input.frequency),
      annualReturn: input.annualReturn,
      volatility: input.volatility,
      withdrawalRate: input.withdrawalRate,
      retirementYears: input.retirementYears,
    },
    options,
  );
}
