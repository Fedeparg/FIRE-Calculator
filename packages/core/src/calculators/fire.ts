// Independencia financiera (FIRE). Usa el motor genérico `project` para la
// acumulación (ver core/projection.ts) y añade el objetivo FIRE.
// "Número FIRE" = gasto anual / tasa de retiro segura (regla del 4 % → 25x).

import { project, type Frequency, type ProjectionPoint } from "../projection.js";

export interface FireInput {
  /** Gasto anual deseado una vez alcanzada la independencia. */
  annualExpenses: number;
  /** Patrimonio invertido actual. */
  currentSavings: number;
  /** Ahorro/aportación por periodo hasta alcanzar FIRE. */
  savings: number;
  /** Frecuencia del ahorro (por defecto mensual). */
  frequency?: Frequency;
  /** Rentabilidad anual real esperada, en base 100 (5 = 5 %). */
  annualReturn: number;
  /** Tasa de retiro segura, en base 100 (4 = 4 %). */
  withdrawalRate: number;
  /** Crecimiento anual del ahorro, en base 100 (subirlo con el sueldo). Opcional. */
  savingsGrowth?: number;
}

export interface FireYearPoint extends ProjectionPoint {
  /** Patrimonio objetivo (constante = número FIRE). */
  target: number;
}

export interface FireResult {
  /** Patrimonio objetivo para vivir de las rentas. */
  fireNumber: number;
  /** Años hasta alcanzarlo, o null si no se alcanza en el horizonte. */
  yearsToFire: number | null;
  series: FireYearPoint[];
}

/** Horizonte máximo de acumulación, en años (compartido con el simulador Monte Carlo). */
export const MAX_YEARS = 60;

export function computeFire(input: FireInput): FireResult {
  const annualExpenses = Math.max(0, input.annualExpenses || 0);
  const withdrawalRate = input.withdrawalRate > 0 ? input.withdrawalRate : 4;
  const fireNumber = annualExpenses / (withdrawalRate / 100);

  const projection = project({
    initial: input.currentSavings,
    contribution: input.savings,
    frequency: input.frequency ?? "monthly",
    annualRate: input.annualReturn,
    years: MAX_YEARS,
    contributionGrowth: input.savingsGrowth,
  });

  let yearsToFire: number | null = null;
  const series: FireYearPoint[] = projection.series.map((p) => {
    if (yearsToFire === null && p.value >= fireNumber) yearsToFire = p.year;
    return { ...p, target: fireNumber };
  });

  // Recortar la gráfica unos años después de alcanzar el objetivo (legibilidad).
  const trimmed = yearsToFire === null ? series : series.filter((p) => p.year <= (yearsToFire as number) + 3);

  return { fireNumber, yearsToFire, series: trimmed };
}
