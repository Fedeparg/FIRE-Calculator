/**
 * FIRE goal milestones (pure logic). The goal repeats the FIRE calculator's formula
 * (annual spending / withdrawal rate, 4 % if not positive); the full projection is not needed and a test pins it.
 */

import { goalModeFromInputs } from '@sextante/core/portfolio/goal';

/** Notified milestones, as % of the goal. */
export const FIRE_MILESTONES = [25, 50, 75, 100] as const;
export type FireMilestone = (typeof FIRE_MILESTONES)[number];

const DEFAULT_WITHDRAWAL_RATE = 4;

export interface FireTarget {
  target: number;
  currency: string;
}

const finite = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

/** Goal of a FIRE scenario, or `null` if there is no positive annual spending. `goalCurrency` is added by the portfolio block; without it, EUR. */
export function fireTargetFromInputs(inputs: Record<string, unknown>): FireTarget | null {
  const currency =
    typeof inputs.goalCurrency === 'string' && /^[A-Z]{3}$/.test(inputs.goalCurrency) ? inputs.goalCurrency : 'EUR';
  // Amount mode ("X in N years"): the goal is the figure as is.
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

/** New milestone to notify (the highest, if above the last notified one). If several are crossed at once, only the highest. */
export function newMilestone(progress: number, lastNotified: number): FireMilestone | null {
  const reached = reachedMilestone(progress);
  return reached !== 0 && reached > lastNotified ? reached : null;
}
