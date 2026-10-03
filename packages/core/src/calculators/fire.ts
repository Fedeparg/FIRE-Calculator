// Independencia financiera (FIRE): acumulación con `project` más el objetivo. Número FIRE = gasto anual / tasa de retiro (4 % → 25x).

import { project, type Frequency, type ProjectionPoint } from "../projection.js";

export interface FireInput {
  annualExpenses: number;
  currentSavings: number;
  savings: number;
  frequency?: Frequency;
  /** Rentabilidad anual real esperada, en base 100. */
  annualReturn: number;
  withdrawalRate: number;
  savingsGrowth?: number;
}

export interface FireYearPoint extends ProjectionPoint {
  target: number;
}

export interface FireResult {
  fireNumber: number;
  yearsToFire: number | null;
  series: FireYearPoint[];
}

/** Regla del 4 %, en base 100: tasa de retirada segura por defecto (también la usa `ahorro-jubilacion`). */
export const SAFE_WITHDRAWAL_RATE_PERCENT = 4;

/** Horizonte máximo (años) en el que se busca alcanzar el número FIRE. */
export const FIRE_SEARCH_MAX_YEARS = 60;

export function computeFire(input: FireInput): FireResult {
  const annualExpenses = Math.max(0, input.annualExpenses || 0);
  const withdrawalRate = input.withdrawalRate > 0 ? input.withdrawalRate : SAFE_WITHDRAWAL_RATE_PERCENT;
  const fireNumber = annualExpenses / (withdrawalRate / 100);

  const projection = project({
    initial: input.currentSavings,
    contribution: input.savings,
    frequency: input.frequency ?? "monthly",
    annualRate: input.annualReturn,
    years: FIRE_SEARCH_MAX_YEARS,
    contributionGrowth: input.savingsGrowth,
  });

  const yearsToFire = projection.series.find((p) => p.value >= fireNumber)?.year ?? null;
  const series: FireYearPoint[] = projection.series.map((p) => ({ ...p, target: fireNumber }));

  // se recorta la gráfica unos años tras alcanzar el objetivo
  const trimmed = yearsToFire === null ? series : series.filter((p) => p.year <= yearsToFire + 3);

  return { fireNumber, yearsToFire, series: trimmed };
}
