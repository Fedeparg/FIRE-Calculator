// Reading a saved FIRE goal scenario. Pure core (no React), testable.
//
// Shared by the full goal block (FIRE goal tab) and the compact card on the Summary tab, so
// both read the same scenario the same way.

import { convertCurrency } from "@sextante/core/fx";
import {
  computeGoalProgress,
  GOAL_MODES,
  goalModeFromInputs,
  type GoalMode,
  type GoalOutcome,
} from "@sextante/core/portfolio/goal";
import { FREQUENCIES, type Frequency } from "@sextante/core/projection";
import { decodeCalculatorInputs, type FieldSpecs } from "@/shared/url-state/url-state";
import { SUPPORTED_CURRENCIES } from "@sextante/core/contracts";

/**
 * Goal fields, with the SAME keys as the financial independence calculator (`FireCalculator`), so
 * a scenario saved in either place loads in the other. `currentSavings` is deliberately not
 * declared: here the current net worth is not typed in, the portfolio provides it.
 *
 * `goalCurrency` is a key OWNED by the goal: the calculator does not register it, so
 * `decodeCalculatorInputs` ignores it there. It records the currency the amounts were saved in;
 * if it is missing (a scenario created in the calculator, which is euro-only) EUR is assumed.
 */
export const GOAL_FIELD_SPECS: FieldSpecs = {
  annualExpenses: { kind: "number", defaultValue: 24000 },
  savings: { kind: "number", defaultValue: 800 },
  frequency: { kind: "option", defaultValue: "monthly", allowed: FREQUENCIES },
  annualReturn: { kind: "number", defaultValue: 5 },
  withdrawalRate: { kind: "number", defaultValue: 4 },
  // Same keys as the Monte Carlo simulator: the FIRE calculator does not register them.
  volatility: { kind: "number", defaultValue: 15 },
  retirementYears: { kind: "number", defaultValue: 40 },
  goalCurrency: { kind: "option", defaultValue: "EUR", allowed: SUPPORTED_CURRENCIES },
  // "X in N years" mode: keys owned by the goal, which the calculator ignores.
  goalMode: { kind: "option", defaultValue: "fire", allowed: GOAL_MODES },
  targetAmount: { kind: "number", defaultValue: 100000 },
  targetYears: { kind: "number", defaultValue: 10 },
};

/** What defines a goal, as it was saved (amounts in `currency`). */
export interface GoalSettings {
  mode: GoalMode;
  currency: string;
  annualExpenses: number;
  /** Contribution per period (`frequency`). */
  contribution: number;
  frequency: Frequency;
  annualReturn: number;
  withdrawalRate: number;
  volatility: number;
  retirementYears: number;
  /** Amount mode: figure to reach, in `currency`. */
  targetAmount: number;
  /** Amount mode: term in whole years. */
  targetYears: number;
}

function isFrequency(value: unknown): value is Frequency {
  return typeof value === "string" && (FREQUENCIES as readonly string[]).includes(value);
}

const number = (value: unknown, fallback: number): number => (typeof value === "number" ? value : fallback);

/**
 * Goal from a scenario's `inputs`. A missing or invalid field takes its default from
 * `GOAL_FIELD_SPECS`, except the amounts, which become 0: making up an expense or a contribution
 * the user did not write would yield a goal that is not theirs.
 */
export function goalSettingsFromInputs(inputs: unknown): GoalSettings {
  const values = decodeCalculatorInputs(inputs, GOAL_FIELD_SPECS);
  return {
    mode: goalModeFromInputs(inputs),
    currency: typeof values.goalCurrency === "string" ? values.goalCurrency : "EUR",
    annualExpenses: number(values.annualExpenses, 0),
    contribution: number(values.savings, 0),
    frequency: isFrequency(values.frequency) ? values.frequency : "monthly",
    annualReturn: number(values.annualReturn, 5),
    withdrawalRate: number(values.withdrawalRate, 4),
    volatility: number(values.volatility, 15),
    retirementYears: number(values.retirementYears, 40),
    targetAmount: number(values.targetAmount, 0),
    targetYears: number(values.targetYears, 10),
  };
}

/**
 * Portfolio progress towards a saved goal, in the `display` currency. `null` if the goal amounts
 * cannot be converted into that currency (missing rate): comparing amounts in different
 * currencies would give a false percentage.
 */
export function goalProgress(
  settings: GoalSettings,
  currentValue: number,
  display: string,
  rates: Record<string, number>,
): GoalOutcome | null {
  const convert = (amount: number) => convertCurrency(amount, settings.currency, display, rates);
  const contribution = convert(settings.contribution);
  if (contribution === null) return null;
  const common = {
    currentValue,
    contribution,
    frequency: settings.frequency,
    annualReturn: settings.annualReturn,
  };
  if (settings.mode === "amount") {
    const targetAmount = convert(settings.targetAmount);
    if (targetAmount === null) return null;
    return computeGoalProgress({ mode: "amount", targetAmount, targetYears: settings.targetYears }, common);
  }
  const annualExpenses = convert(settings.annualExpenses);
  if (annualExpenses === null) return null;
  return computeGoalProgress({ mode: "fire", annualExpenses, withdrawalRate: settings.withdrawalRate }, common);
}
