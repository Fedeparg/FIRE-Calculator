/**
 * Hitos del objetivo FIRE (lógica pura). El objetivo repite la fórmula de la calculadora FIRE
 * (gasto anual / tasa de retiro, 4 % si no es positiva); no hace falta la proyección entera y un test la fija.
 */

import { goalModeFromInputs } from '@sextante/core/portfolio/goal';

/** Hitos avisados, en % del objetivo. */
export const FIRE_MILESTONES = [25, 50, 75, 100] as const;
export type FireMilestone = (typeof FIRE_MILESTONES)[number];

const DEFAULT_WITHDRAWAL_RATE = 4;

export interface FireTarget {
  target: number;
  currency: string;
}

const finite = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

/** Objetivo de un escenario FIRE, o `null` si no hay gasto anual positivo. `goalCurrency` la añade el bloque de cartera; sin ella, EUR. */
export function fireTargetFromInputs(inputs: Record<string, unknown>): FireTarget | null {
  const currency =
    typeof inputs.goalCurrency === 'string' && /^[A-Z]{3}$/.test(inputs.goalCurrency) ? inputs.goalCurrency : 'EUR';
  // Modo cantidad ("X en N años"): el objetivo es la cifra tal cual.
  if (goalModeFromInputs(inputs) === 'amount') {
    const amount = finite(inputs.targetAmount);
    return amount !== null && amount > 0 ? { target: amount, currency } : null;
  }
  const expenses = finite(inputs.annualExpenses);
  if (expenses === null || expenses <= 0) return null;
  const rawRate = finite(inputs.withdrawalRate);
  const rate = rawRate !== null && rawRate > 0 ? rawRate : DEFAULT_WITHDRAWAL_RATE;
  return { target: expenses / (rate / 100), currency };
}

export function reachedMilestone(progress: number): FireMilestone | 0 {
  let reached: FireMilestone | 0 = 0;
  for (const milestone of FIRE_MILESTONES) {
    if (Number.isFinite(progress) && progress >= milestone) reached = milestone;
  }
  return reached;
}

/** Hito nuevo a avisar (el más alto si supera al último avisado). Si se cruzan varios de golpe, solo el mayor. */
export function newMilestone(progress: number, lastNotified: number): FireMilestone | null {
  const reached = reachedMilestone(progress);
  return reached !== 0 && reached > lastNotified ? reached : null;
}
