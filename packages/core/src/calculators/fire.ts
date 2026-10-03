// Financial independence (FIRE): accumulation with `project` plus the target. FIRE number = annual spending /
// withdrawal rate (4% → 25x).

import { project, type Frequency, type ProjectionPoint } from "../projection.js";

export interface FireInput {
  annualExpenses: number;
  currentSavings: number;
  savings: number;
  frequency?: Frequency;
  /** Expected real annual return, in base 100. */
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

/** The 4% rule, in base 100: default safe withdrawal rate (also used by `ahorro-jubilacion`). */
export const SAFE_WITHDRAWAL_RATE_PERCENT = 4;

/** Maximum horizon (years) over which we search for reaching the FIRE number. */
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

  // trim the chart a few years after the target is reached
  const trimmed = yearsToFire === null ? series : series.filter((p) => p.year <= yearsToFire + 3);

  return { fireNumber, yearsToFire, series: trimmed };
}
