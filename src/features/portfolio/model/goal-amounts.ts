// Amounts and computation for the portfolio's "Your goal" block. Pure core (no React), testable.
//
// The screen state keeps the amounts in the currency they were entered in; here they are
// derived into the currency being viewed, and the result and the scenario body are built.

import { convertCurrency } from "@sextante/core/fx";
import { computeGoalProgress, type GoalMode, type GoalOutcome } from "@sextante/core/portfolio/goal";
import type { Frequency } from "@sextante/core/projection";
import { roundCents } from "@sextante/core/money";
import type { GoalSettings } from "./goal-scenario";

/** Goal amounts, with the currency they were entered or saved in. */
export type GoalAmounts = { currency: string; annualExpenses: number; contribution: number; targetAmount: number };

/** Notice about the amounts' currency when it differs from the one being viewed. */
export type CurrencyNote = { kind: "converted" | "notConvertible"; from: string; to: string } | null;

/** Amounts already expressed in the currency being viewed, with the applicable notice. */
export type ShownAmounts = Omit<GoalAmounts, "currency"> & { note: CurrencyNote };

/** Example figure for amount mode (in the currency being viewed). */
export const DEFAULT_TARGET_AMOUNT = 100000;

/** Amounts of a saved goal, in ITS currency (`settings.currency`). */
export function amountsFromSettings(settings: GoalSettings): GoalAmounts {
  return {
    currency: settings.currency,
    annualExpenses: settings.annualExpenses,
    contribution: settings.contribution,
    targetAmount: settings.targetAmount,
  };
}

/** Non-monetary parameters of a saved goal. */
export function paramsFromSettings(settings: GoalSettings): GoalParams {
  return {
    mode: settings.mode,
    frequency: settings.frequency,
    annualReturn: settings.annualReturn,
    withdrawalRate: settings.withdrawalRate,
    targetYears: settings.targetYears,
    volatility: settings.volatility,
    retirementYears: settings.retirementYears,
  };
}

/**
 * Amounts in the currency being viewed. If the rate is missing nothing is made up (they are
 * returned as-is and `note` says so) rather than comparing amounts in different currencies.
 */
export function showAmounts(amounts: GoalAmounts, display: string, rates: Record<string, number>): ShownAmounts {
  const { currency, ...original } = amounts;
  if (currency === display) return { ...original, note: null };
  const expenses = convertCurrency(original.annualExpenses, currency, display, rates);
  const periodic = convertCurrency(original.contribution, currency, display, rates);
  const target = convertCurrency(original.targetAmount, currency, display, rates);
  if (expenses === null || periodic === null || target === null) {
    return { ...original, note: { kind: "notConvertible", from: currency, to: display } };
  }
  return {
    annualExpenses: roundCents(expenses),
    contribution: roundCents(periodic),
    targetAmount: roundCents(target),
    note: { kind: "converted", from: currency, to: display },
  };
}

/** Non-monetary goal parameters, as the screen edits them. */
export type GoalParams = {
  mode: GoalMode;
  frequency: Frequency;
  annualReturn: number;
  withdrawalRate: number;
  targetYears: number;
  volatility: number;
  retirementYears: number;
};

/** Goal result against the portfolio's current value (`computeGoalProgress`). */
export function computeGoal(shown: ShownAmounts, params: GoalParams, marketValue: number): GoalOutcome {
  const common = {
    currentValue: marketValue,
    contribution: shown.contribution,
    frequency: params.frequency,
    annualReturn: params.annualReturn,
  };
  return computeGoalProgress(
    params.mode === "amount"
      ? { mode: "amount", targetAmount: shown.targetAmount, targetYears: params.targetYears }
      : { mode: "fire", annualExpenses: shown.annualExpenses, withdrawalRate: params.withdrawalRate },
    common,
  );
}

/**
 * `inputs` of the scenario to save: those of the loaded scenario (so the keys this block does
 * not edit are not lost) with the goal fields overwritten. `currentSavings` is the portfolio's
 * actual net worth, so opening the scenario in the calculator reproduces the same computation.
 */
export function buildGoalInputs(
  loadedInputs: Record<string, unknown>,
  shown: ShownAmounts,
  params: GoalParams,
  display: string,
  currentValue: number,
): Record<string, unknown> {
  return {
    ...loadedInputs,
    annualExpenses: shown.annualExpenses,
    currentSavings: roundCents(currentValue),
    savings: shown.contribution,
    frequency: params.frequency,
    annualReturn: params.annualReturn,
    withdrawalRate: params.withdrawalRate,
    volatility: params.volatility,
    retirementYears: params.retirementYears,
    goalCurrency: display,
    goalMode: params.mode,
    targetAmount: shown.targetAmount,
    targetYears: params.targetYears,
  };
}
