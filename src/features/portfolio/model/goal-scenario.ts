// Lectura de un escenario guardado del objetivo FIRE. Core puro (sin React), testeable.
//
// La comparten el bloque completo del objetivo (pestaña Objetivo FIRE) y la tarjeta resumida
// de la pestaña Resumen, para que las dos lean el mismo escenario de la misma manera.

import { convertCurrency } from "@sextante/core/fx";
import {
  computeAmountGoal,
  computePortfolioGoal,
  GOAL_MODES,
  goalModeFromInputs,
  type AmountGoalResult,
  type GoalMode,
  type PortfolioGoalResult,
} from "@sextante/core/portfolio/goal";
import { FREQUENCIES, type Frequency } from "@sextante/core/projection";
import { decodeCalculatorInputs, type FieldSpecs } from "@/shared/url-state/url-state";
import { SUPPORTED_CURRENCIES } from "@sextante/core/contracts";

/**
 * Campos del objetivo, con las MISMAS claves que la calculadora de independencia financiera
 * (`FireCalculator`), para que un escenario guardado en cualquiera de los dos sitios se cargue
 * en el otro. `currentSavings` no se declara a propósito: aquí el patrimonio actual no se
 * teclea, lo pone la cartera.
 *
 * `goalCurrency` es una clave PROPIA del objetivo: la calculadora no la registra, así que
 * `decodeCalculatorInputs` la ignora allí. Sirve para saber en qué divisa se guardaron los
 * importes; si falta (escenario creado en la calculadora, que es solo en euros) se asume EUR.
 */
export const GOAL_FIELD_SPECS: FieldSpecs = {
  annualExpenses: { kind: "number", defaultValue: 24000 },
  savings: { kind: "number", defaultValue: 800 },
  frequency: { kind: "option", defaultValue: "monthly", allowed: FREQUENCIES },
  annualReturn: { kind: "number", defaultValue: 5 },
  withdrawalRate: { kind: "number", defaultValue: 4 },
  // Mismas claves que el simulador Monte Carlo: la calculadora FIRE no las registra.
  volatility: { kind: "number", defaultValue: 15 },
  retirementYears: { kind: "number", defaultValue: 40 },
  goalCurrency: { kind: "option", defaultValue: "EUR", allowed: SUPPORTED_CURRENCIES },
  // Modo "X en N años": claves propias del objetivo, que la calculadora ignora.
  goalMode: { kind: "option", defaultValue: "fire", allowed: GOAL_MODES },
  targetAmount: { kind: "number", defaultValue: 100000 },
  targetYears: { kind: "number", defaultValue: 10 },
};

/** Lo que define un objetivo, tal y como se guardó (importes en `currency`). */
export interface GoalSettings {
  mode: GoalMode;
  currency: string;
  annualExpenses: number;
  /** Aportación por periodo (`frequency`). */
  contribution: number;
  frequency: Frequency;
  annualReturn: number;
  withdrawalRate: number;
  volatility: number;
  retirementYears: number;
  /** Modo cantidad: cifra a reunir, en `currency`. */
  targetAmount: number;
  /** Modo cantidad: plazo en años enteros. */
  targetYears: number;
}

/** Resultado de un objetivo, con su modo para que quien lo pinte sepa qué campos tiene. */
export type GoalOutcome = ({ mode: "fire" } & PortfolioGoalResult) | ({ mode: "amount" } & AmountGoalResult);

function isFrequency(value: unknown): value is Frequency {
  return typeof value === "string" && (FREQUENCIES as readonly string[]).includes(value);
}

const number = (value: unknown, fallback: number): number => (typeof value === "number" ? value : fallback);

/**
 * Objetivo a partir de los `inputs` de un escenario. Un campo ausente o inválido toma el valor
 * por defecto de `GOAL_FIELD_SPECS`, salvo los importes, que pasan a 0: inventar un gasto o una
 * aportación que el usuario no escribió daría un objetivo que no es el suyo.
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
 * Progreso de la cartera hacia un objetivo guardado, en la divisa `display`. `null` si los
 * importes del objetivo no se pueden convertir a esa divisa (falta la tasa): comparar importes
 * de divisas distintas daría un porcentaje falso.
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
    return { mode: "amount", ...computeAmountGoal({ ...common, targetAmount, years: settings.targetYears }) };
  }
  const annualExpenses = convert(settings.annualExpenses);
  if (annualExpenses === null) return null;
  return {
    mode: "fire",
    ...computePortfolioGoal({ ...common, annualExpenses, withdrawalRate: settings.withdrawalRate }),
  };
}
