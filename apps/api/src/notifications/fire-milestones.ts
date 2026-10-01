/**
 * Hitos del objetivo FIRE: lógica pura (sin Nest ni BD), testeable.
 *
 * El objetivo se reconstruye con la MISMA fórmula que la calculadora FIRE
 * (`@sextante/core/calculators/fire`): patrimonio objetivo = gasto anual / tasa de retiro, con
 * la tasa por defecto del 4 % si no es positiva. Aquí solo hace falta esa división, no la
 * proyección entera, así que se repite y un test la fija.
 */

import { goalModeFromInputs } from '@sextante/core/portfolio-goal';

/** Hitos que se avisan, en % del objetivo, de menor a mayor. */
export const FIRE_MILESTONES = [25, 50, 75, 100] as const;
export type FireMilestone = (typeof FIRE_MILESTONES)[number];

/** Tasa de retiro por defecto (base 100), la misma que la calculadora FIRE. */
const DEFAULT_WITHDRAWAL_RATE = 4;

/** Objetivo FIRE tal y como sale de un escenario guardado. */
export interface FireTarget {
  /** Patrimonio objetivo, en `currency`. */
  target: number;
  /** Divisa en la que se guardaron los importes del objetivo. */
  currency: string;
}

const finite = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

/**
 * Objetivo a partir de los `inputs` de un escenario de la calculadora FIRE, o `null` si no se
 * puede calcular (sin gasto anual positivo no hay objetivo que perseguir). `goalCurrency` es la
 * divisa que añade el bloque de la cartera; un escenario creado en la calculadora es en euros.
 */
export function fireTargetFromInputs(inputs: Record<string, unknown>): FireTarget | null {
  const currency =
    typeof inputs.goalCurrency === 'string' && /^[A-Z]{3}$/.test(inputs.goalCurrency)
      ? inputs.goalCurrency
      : 'EUR';
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

/** Hito más alto alcanzado con este progreso (en %), o 0 si no llega al primero. */
export function reachedMilestone(progress: number): FireMilestone | 0 {
  let reached: FireMilestone | 0 = 0;
  for (const milestone of FIRE_MILESTONES) {
    if (Number.isFinite(progress) && progress >= milestone) reached = milestone;
  }
  return reached;
}

/**
 * Hito NUEVO que avisar: el más alto alcanzado si supera al último avisado; `null` si no hay
 * nada nuevo. Si se cruzan varios de golpe (una aportación grande), solo se avisa del mayor:
 * tres emails seguidos no aportarían nada.
 */
export function newMilestone(progress: number, lastNotified: number): FireMilestone | null {
  const reached = reachedMilestone(progress);
  return reached !== 0 && reached > lastNotified ? reached : null;
}
