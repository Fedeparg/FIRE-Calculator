// Importes y cálculo del bloque "Tu objetivo" de la cartera. Core puro (sin React), testeable.
//
// El estado de la pantalla guarda los importes en la divisa en que se introdujeron; aquí se
// derivan a la divisa que se está viendo y se arma el resultado y el cuerpo del escenario.

import { convertCurrency } from "@sextante/core/fx";
import { computeGoalProgress, type GoalMode, type GoalOutcome } from "@sextante/core/portfolio/goal";
import type { Frequency } from "@sextante/core/projection";
import type { GoalSettings } from "./goal-scenario";

/** Importes del objetivo, con la divisa en la que se introdujeron o se guardaron. */
export type GoalAmounts = { currency: string; annualExpenses: number; contribution: number; targetAmount: number };

/** Aviso sobre la divisa de los importes cuando no coincide con la que se está viendo. */
export type CurrencyNote = { kind: "converted" | "notConvertible"; from: string; to: string } | null;

/** Importes ya expresados en la divisa que se está viendo, con el aviso que toque. */
export type ShownAmounts = Omit<GoalAmounts, "currency"> & { note: CurrencyNote };

/** Cifra de ejemplo del modo cantidad (en la divisa que se está viendo). */
export const DEFAULT_TARGET_AMOUNT = 100000;

/** Redondeo a céntimos: los importes convertidos no deben arrastrar decimales binarios. */
export function toCents(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Importes de un objetivo guardado, en SU divisa (`settings.currency`). */
export function amountsFromSettings(settings: GoalSettings): GoalAmounts {
  return {
    currency: settings.currency,
    annualExpenses: settings.annualExpenses,
    contribution: settings.contribution,
    targetAmount: settings.targetAmount,
  };
}

/** Parámetros no monetarios de un objetivo guardado. */
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
 * Importes en la divisa que se está viendo. Si falta la tasa no se inventa nada —se devuelven
 * tal cual y `note` lo dice—, en vez de comparar importes de divisas distintas.
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
    annualExpenses: toCents(expenses),
    contribution: toCents(periodic),
    targetAmount: toCents(target),
    note: { kind: "converted", from: currency, to: display },
  };
}

/** Parámetros no monetarios del objetivo, tal y como los edita la pantalla. */
export type GoalParams = {
  mode: GoalMode;
  frequency: Frequency;
  annualReturn: number;
  withdrawalRate: number;
  targetYears: number;
  volatility: number;
  retirementYears: number;
};

/** Resultado del objetivo contra el valor actual de la cartera (`computeGoalProgress`). */
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
 * `inputs` del escenario a guardar: los del escenario cargado (para no perder las claves que
 * este bloque no edita) con los campos del objetivo sobrescritos. El `currentSavings` es el
 * patrimonio real de la cartera, de modo que abrir el escenario en la calculadora reproduce el
 * mismo cálculo.
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
    currentSavings: toCents(currentValue),
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
