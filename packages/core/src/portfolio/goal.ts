/**
 * Puente entre la calculadora FIRE y la cartera real: objetivo, patrimonio actual y lo que falta.
 * Core puro. No reimplementa nada: sustituye el patrimonio tecleado por el valor de mercado y deriva
 * el progreso. Agnóstico de divisa: `annualExpenses`, `contribution` y `currentValue` van en la misma.
 */

import { computeFire, FIRE_SEARCH_MAX_YEARS } from "../calculators/fire.js";
import { simulateFire, type MonteCarloOptions, type MonteCarloResult } from "../calculators/fire-montecarlo.js";
import { PERIODS_PER_YEAR, periodRateFromEffective, project, type Frequency } from "../projection.js";

/** Slug de la calculadora FIRE; los escenarios guardados lo comparten con el objetivo de la cartera. */
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
  /** Porcentaje completado (0–100), o `null` si el objetivo no es positivo (la UI lo pinta como "—"). */
  progress: number | null;
  /** Lo que falta para el objetivo (0 si ya se ha alcanzado). */
  remaining: number;
  /** Años hasta alcanzarlo con la aportación actual; `0` si ya está, `null` si no se llega en 60 años. */
  yearsToTarget: number | null;
  /** Si el patrimonio actual ya cubre el objetivo. */
  reached: boolean;
}

/**
 * Progreso de la cartera hacia el objetivo FIRE. Casos borde (con test): gasto 0 → alcanzado con
 * `progress` null; tasa de retiro <= 0 → se hereda el 4 % de `computeFire`; patrimonio no finito
 * o negativo → 0.
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
    // fuerza coherencia entre "alcanzado" y "0 años"
    yearsToTarget: reached ? 0 : fire.yearsToFire,
    reached,
  };
}

/** Modo de un objetivo guardado: `fire` (vivir de rentas) o `amount` (reunir una cantidad en un plazo). */
export type GoalMode = "fire" | "amount";
export const GOAL_MODES: readonly GoalMode[] = ["fire", "amount"];

/** Modo de los `inputs` de un escenario; sin la clave (escenarios antiguos) es `fire`. */
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
  /** Aportación por periodo para llegar justo a tiempo; 0 si ya se llega, `null` si no se puede. */
  requiredContribution: number | null;
  /** Si al ritmo actual se llega dentro del plazo. */
  onTrack: boolean;
}

/**
 * Objetivo "quiero X en N años" con las convenciones de `project`. La aportación necesaria despeja
 * P en `VF = C·(1+i)^n + P·((1+i)^n − 1) / i` (con i = 0, P·n).
 */
export function computeAmountGoal(input: AmountGoalInput): AmountGoalResult {
  const current = Number.isFinite(input.currentValue) && input.currentValue > 0 ? input.currentValue : 0;
  const target = Number.isFinite(input.targetAmount) && input.targetAmount > 0 ? input.targetAmount : 0;
  const deadlineYears = Math.max(0, Math.round(Number.isFinite(input.years) ? input.years : 0));
  const reached = current >= target;

  const periodsPerYear = PERIODS_PER_YEAR[input.frequency] ?? 12;
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

export interface PortfolioGoalSimulationInput extends PortfolioGoalInput {
  /** Volatilidad anual de la cartera, en base 100 (15 = 15 %). */
  volatility: number;
  /** Años que el patrimonio debe sostener el gasto una vez alcanzado el objetivo. */
  retirementYears: number;
}

/**
 * Aportación expresada como ahorro mensual (lo que recibe el simulador Monte Carlo), conservando el
 * total anual. También la usa el enlace "Abrir en el simulador".
 */
export function monthlyContribution(contribution: number, frequency: Frequency): number {
  const periodsPerYear = PERIODS_PER_YEAR[frequency] ?? 12;
  return (contribution * periodsPerYear) / 12;
}

/**
 * Probabilidad de alcanzar y sostener el objetivo con el patrimonio real: `simulateFire` con el
 * valor de mercado, sin segundo modelo. El simulador aporta al final de cada año, así que solo
 * coincide con `computePortfolioGoal` en frecuencia anual.
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
