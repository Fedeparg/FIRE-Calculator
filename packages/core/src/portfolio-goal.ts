/**
 * Puente entre la calculadora de independencia financiera y la cartera real: qué patrimonio
 * hace falta (objetivo FIRE), cuánto llevas de verdad y cuánto falta al ritmo de aportación
 * actual. Core puro (sin React), testeable.
 *
 * NO reimplementa nada: el objetivo y el horizonte los calcula `computeFire`, que a su vez
 * delega la acumulación en `project` (`core/projection.ts`). Aquí solo se sustituye el
 * "patrimonio actual" tecleado por el VALOR DE MERCADO real de la cartera y se derivan las
 * cifras de progreso.
 *
 * Divisa: este módulo es agnóstico. Quien llama debe pasar `annualExpenses`, `contribution` y
 * `currentValue` en la MISMA divisa (la elegida en la cartera); los resultados salen en esa.
 */

import { computeFire, MAX_YEARS } from "./calculators/fire.js";
import { simulateFire, type MonteCarloOptions, type MonteCarloResult } from "./calculators/fire-montecarlo.js";
import { PERIODS_PER_YEAR, project, type Frequency } from "./projection.js";

/**
 * Slug de la calculadora de independencia financiera en `registry.ts`. Identifica los
 * escenarios guardados que comparten la calculadora y este bloque de la cartera: el objetivo
 * se guarda con este slug para que los dos sitios vean exactamente los mismos escenarios.
 */
export const FIRE_CALCULATOR_SLUG = "independencia-financiera";

export interface PortfolioGoalInput {
  /** Gasto anual estimado una vez alcanzada la independencia. */
  annualExpenses: number;
  /** Tasa de retiro segura, en base 100 (4 = regla del 4 %). */
  withdrawalRate: number;
  /** Valor de mercado actual de la cartera (el mismo total que muestra el resumen). */
  currentValue: number;
  /** Aportación por periodo con la que se estima el tiempo restante. */
  contribution: number;
  /** Frecuencia de la aportación. */
  frequency: Frequency;
  /** Rentabilidad anual esperada, en base 100. */
  annualReturn: number;
}

export interface PortfolioGoalResult {
  /** Patrimonio objetivo (número FIRE = gasto anual / tasa de retiro). */
  target: number;
  /** Patrimonio actual usado en la comparación (ya saneado). */
  current: number;
  /**
   * Porcentaje completado (0–100, acotado), o `null` cuando no es representable: sin objetivo
   * positivo la razón "cuánto llevas del objetivo" no significa nada. La interfaz lo pinta
   * como "—" y omite la barra, igual que `format.ts` hace con los valores no finitos.
   */
  progress: number | null;
  /** Lo que falta para el objetivo (0 si ya se ha alcanzado). */
  remaining: number;
  /**
   * Años estimados hasta alcanzarlo manteniendo la aportación, `0` si ya está alcanzado y
   * `null` si no se llega dentro del horizonte que proyecta `computeFire` (60 años).
   */
  yearsToTarget: number | null;
  /** Si el patrimonio actual ya cubre el objetivo. */
  reached: boolean;
}

/**
 * Progreso de la cartera hacia el objetivo de independencia financiera.
 *
 * Casos borde (deliberados, con test):
 * - Gasto anual 0 → objetivo 0: se considera alcanzado, pero `progress` es `null` porque un
 *   porcentaje sobre un objetivo nulo no dice nada.
 * - Tasa de retiro 0 (o negativa) → se hereda el 4 % por defecto de `computeFire`, para que
 *   la calculadora y la cartera den siempre la misma cifra.
 * - Patrimonio actual no finito o negativo → 0. `computeFire` ya sanea el resto de entradas,
 *   así que ningún `NaN` sale de aquí.
 */
export function computePortfolioGoal(input: PortfolioGoalInput): PortfolioGoalResult {
  const current =
    Number.isFinite(input.currentValue) && input.currentValue > 0 ? input.currentValue : 0;

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
  const progress =
    Number.isFinite(target) && target > 0 ? Math.min(100, (current / target) * 100) : null;

  return {
    target,
    current,
    progress,
    remaining: Math.max(0, target - current),
    // `computeFire` ya devuelve 0 cuando el patrimonio inicial cubre el objetivo; se fuerza
    // igualmente para que "alcanzado" y "0 años" no puedan contradecirse nunca.
    yearsToTarget: reached ? 0 : fire.yearsToFire,
    reached,
  };
}

/**
 * Modo de un objetivo guardado. `fire`: vivir de las rentas (gasto anual / tasa de retiro).
 * `amount`: reunir una cantidad en un plazo. Lo leen igual la web, los avisos y MCP.
 */
export type GoalMode = "fire" | "amount";
export const GOAL_MODES: readonly GoalMode[] = ["fire", "amount"];

/** Modo de los `inputs` de un escenario: sin la clave (escenarios antiguos) es `fire`. */
export function goalModeFromInputs(inputs: unknown): GoalMode {
  const mode = typeof inputs === "object" && inputs !== null ? (inputs as Record<string, unknown>).goalMode : undefined;
  return mode === "amount" ? "amount" : "fire";
}

export interface AmountGoalInput {
  /** Cantidad a reunir. */
  targetAmount: number;
  /** Plazo en años enteros (se redondea, como en `project`). */
  years: number;
  currentValue: number;
  /** Aportación por periodo (`frequency`). */
  contribution: number;
  frequency: Frequency;
  /** Rentabilidad anual esperada, en base 100. */
  annualReturn: number;
}

export interface AmountGoalResult extends PortfolioGoalResult {
  /** Plazo usado, en años enteros. */
  deadlineYears: number;
  /** Valor proyectado al final del plazo con la aportación actual. */
  projectedAtDeadline: number;
  /**
   * Aportación por periodo necesaria para llegar justo a tiempo. 0 si ya se llega sin aportar;
   * `null` si no se puede (plazo 0 sin haber llegado, o resultado no finito).
   */
  requiredContribution: number | null;
  /** Si al ritmo actual se llega dentro del plazo. */
  onTrack: boolean;
}

/**
 * Objetivo "quiero X en N años", con las mismas convenciones que `project`: interés por
 * periodo `annualReturn / 100 / periodosPorAño` y aportación al final de cada periodo. La
 * aportación necesaria despeja P en `VF = C·(1+i)^n + P·((1+i)^n − 1) / i` (con i = 0, P·n).
 */
export function computeAmountGoal(input: AmountGoalInput): AmountGoalResult {
  const current =
    Number.isFinite(input.currentValue) && input.currentValue > 0 ? input.currentValue : 0;
  const target = Number.isFinite(input.targetAmount) && input.targetAmount > 0 ? input.targetAmount : 0;
  const deadlineYears = Math.max(0, Math.round(Number.isFinite(input.years) ? input.years : 0));
  const reached = current >= target;

  const periodsPerYear = PERIODS_PER_YEAR[input.frequency] ?? 12;
  const periodRate = (input.annualReturn || 0) / 100 / periodsPerYear;
  const periods = deadlineYears * periodsPerYear;
  const growth = (1 + periodRate) ** periods;
  const annuity = periodRate === 0 ? periods : (growth - 1) / periodRate;

  const projection = project({
    initial: current,
    contribution: input.contribution,
    frequency: input.frequency,
    annualRate: input.annualReturn,
    years: Math.max(MAX_YEARS, deadlineYears),
  });
  const projectedAtDeadline = projection.series[deadlineYears]?.value ?? current;
  const firstYear = projection.series.find((p) => p.year <= MAX_YEARS && p.value >= target)?.year;

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

export interface PortfolioGoalSimulationInput extends PortfolioGoalInput {
  /** Volatilidad anual de la cartera, en base 100 (15 = 15 %). */
  volatility: number;
  /** Años que el patrimonio debe sostener el gasto una vez alcanzado el objetivo. */
  retirementYears: number;
}

/**
 * Aportación del objetivo expresada como ahorro mensual, que es lo que recibe el simulador
 * Monte Carlo (no tiene frecuencia propia). Se conserva el total anual: 1.000 € trimestrales
 * equivalen a 333,33 € al mes. También la usa el enlace "Abrir en el simulador", para que el
 * simulador reciba exactamente la cifra que se simula aquí.
 */
export function monthlyContribution(contribution: number, frequency: Frequency): number {
  const periodsPerYear = PERIODS_PER_YEAR[frequency] ?? 12;
  return (contribution * periodsPerYear) / 12;
}

/**
 * Probabilidad de alcanzar y sostener el objetivo partiendo del patrimonio REAL de la cartera.
 * Es `simulateFire` con el patrimonio actual sustituido por el valor de mercado, igual que
 * `computePortfolioGoal` hace con `computeFire`: no hay un segundo modelo que pueda divergir.
 *
 * El simulador aporta el ahorro sumado al final de cada año, así que con volatilidad 0 coincide
 * con `computePortfolioGoal` en frecuencia ANUAL; con aportación mensual la calculadora
 * determinista capitaliza cada mes y puede adelantarse un año.
 */
export function simulatePortfolioGoal(
  input: PortfolioGoalSimulationInput,
  options?: MonteCarloOptions,
): MonteCarloResult {
  const current =
    Number.isFinite(input.currentValue) && input.currentValue > 0 ? input.currentValue : 0;
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
