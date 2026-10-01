// Lectura de un escenario guardado del objetivo FIRE. Core puro (sin React), testeable.
//
// La comparten el bloque completo del objetivo (pestaña Objetivo FIRE) y la tarjeta resumida
// de la pestaña Resumen, para que las dos lean el mismo escenario de la misma manera.

import { convertCurrency } from "@sextante/core/fx";
import { computePortfolioGoal, type PortfolioGoalResult } from "@sextante/core/portfolio-goal";
import { FREQUENCIES, type Frequency } from "@sextante/core/projection";
import { decodeCalculatorInputs, type FieldSpecs } from "./calculator-url-state";
import { PORTFOLIO_CURRENCIES } from "../lib/portfolio";

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
  goalCurrency: { kind: "option", defaultValue: "EUR", allowed: PORTFOLIO_CURRENCIES },
};

/** Lo que define un objetivo, tal y como se guardó (importes en `currency`). */
export interface GoalSettings {
  currency: string;
  annualExpenses: number;
  /** Aportación por periodo (`frequency`). */
  contribution: number;
  frequency: Frequency;
  annualReturn: number;
  withdrawalRate: number;
  volatility: number;
  retirementYears: number;
}

function isFrequency(value: unknown): value is Frequency {
  return typeof value === "string" && (FREQUENCIES as readonly string[]).includes(value);
}

const number = (value: unknown, fallback: number): number =>
  typeof value === "number" ? value : fallback;

/**
 * Objetivo a partir de los `inputs` de un escenario. Un campo ausente o inválido toma el valor
 * por defecto de `GOAL_FIELD_SPECS`, salvo los importes, que pasan a 0: inventar un gasto o una
 * aportación que el usuario no escribió daría un objetivo que no es el suyo.
 */
export function goalSettingsFromInputs(inputs: unknown): GoalSettings {
  const values = decodeCalculatorInputs(inputs, GOAL_FIELD_SPECS);
  return {
    currency: typeof values.goalCurrency === "string" ? values.goalCurrency : "EUR",
    annualExpenses: number(values.annualExpenses, 0),
    contribution: number(values.savings, 0),
    frequency: isFrequency(values.frequency) ? values.frequency : "monthly",
    annualReturn: number(values.annualReturn, 5),
    withdrawalRate: number(values.withdrawalRate, 4),
    volatility: number(values.volatility, 15),
    retirementYears: number(values.retirementYears, 40),
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
): PortfolioGoalResult | null {
  const annualExpenses = convertCurrency(settings.annualExpenses, settings.currency, display, rates);
  const contribution = convertCurrency(settings.contribution, settings.currency, display, rates);
  if (annualExpenses === null || contribution === null) return null;
  return computePortfolioGoal({
    annualExpenses,
    withdrawalRate: settings.withdrawalRate,
    currentValue,
    contribution,
    frequency: settings.frequency,
    annualReturn: settings.annualReturn,
  });
}

/**
 * Plan activo entre los escenarios FIRE guardados: el actualizado más recientemente. Es la
 * misma regla que siguen los avisos de hitos de la API, así que Resumen, Objetivo y avisos
 * miran siempre el mismo plan. Elegir otro plan lo "toca" (PATCH sin cambios) para activarlo.
 */
export function activeScenario<T extends { updatedAt: string }>(scenarios: readonly T[]): T | null {
  let active: T | null = null;
  for (const scenario of scenarios) {
    if (active === null || Date.parse(scenario.updatedAt) > Date.parse(active.updatedAt)) active = scenario;
  }
  return active;
}
