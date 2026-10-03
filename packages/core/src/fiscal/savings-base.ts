// Netting and offsetting (integración y compensación) of the savings tax base (base imponible del
// ahorro, arts. 46, 48 and 49 LIRPF). Pure core module: it does not translate, the results are
// figures and codes. Scope: see ./README.md.

import { finiteOr } from "../inputs.js";

/**
 * Savings income group: capital gains and losses (ganancias y pérdidas patrimoniales, GPP) or
 * capital income (rendimientos del capital mobiliario, RCM).
 */
export type SavingsGroup = "gains" | "capitalIncome";

/** Limit of cross-group offsetting: 25% of the positive balance (art. 49.1 LIRPF, since 2018). */
export const SAVINGS_CROSS_COMPENSATION_LIMIT = 0.25;

/** Following years in which a negative balance can be offset (art. 49.1 LIRPF). */
export const SAVINGS_CARRYFORWARD_YEARS = 4;

/** Tolerance so floating-point dust is not carried forward as if it were a pending balance. */
const EPSILON = 1e-9;

/** A tax year's negative balance that can still be offset. `amount` is positive. */
export interface PendingNegative {
  readonly originYear: number;
  readonly kind: SavingsGroup;
  readonly amount: number;
}

export interface SavingsBaseInput {
  /** Tax year being assessed. */
  readonly year: number;
  /** The tax year's balance of GPP from transfers (may be negative). */
  readonly gainsBalance: number;
  /** The tax year's net RCM balance (may be negative). */
  readonly capitalIncomeBalance: number;
  /** Pending negative balances from earlier tax years. */
  readonly pending: readonly PendingNegative[];
}

/** An applied offset: from which negative balance, against which positive group and how much. */
export interface SavingsCompensation {
  readonly source: { readonly kind: SavingsGroup; readonly originYear: number };
  readonly target: SavingsGroup;
  readonly amount: number;
  /** `true` if the negative and positive balances belong to different groups (subject to the 25% limit). */
  readonly cross: boolean;
}

export interface SavingsBaseResult {
  /** Savings taxable base (base liquidable del ahorro, ≥ 0), without the art. 55 LIRPF reduction. */
  readonly base: number;
  readonly compensations: readonly SavingsCompensation[];
  readonly totalCompensated: number;
  /** Negative balances still pending (including the current tax year's remainder). */
  readonly pending: readonly PendingNegative[];
  /** Negative balances that expired without being offset (origin before tax year − 4). */
  readonly expired: readonly PendingNegative[];
}

interface NegativeItem {
  readonly kind: SavingsGroup;
  readonly originYear: number;
  remaining: number;
}

const other = (kind: SavingsGroup): SavingsGroup => (kind === "gains" ? "capitalIncome" : "gains");

const finitePositive = (n: number): boolean => Number.isFinite(n) && n > 0;

/**
 * Nets and offsets the savings base (art. 49 LIRPF).
 *
 * Order (Manual práctico de Renta 2025, ch. 12): first the current tax year's negative balance
 * against the other group's positive balance (25%); then the pending balances from earlier tax
 * years, from oldest to newest, against the positive balance of their own group; and finally,
 * with what is left, against the other group's with the same 25%. The 25% is a single allowance
 * per positive group and is computed on its positive balance for the tax year before offsetting.
 * Items with a non-finite or ≤ 0 amount, or with an origin equal to or after the tax year, are
 * ignored.
 */
export function computeSavingsBase(input: SavingsBaseInput): SavingsBaseResult {
  const { year } = input;
  const balances: Record<SavingsGroup, number> = {
    gains: finiteOr(input.gainsBalance, 0),
    capitalIncome: finiteOr(input.capitalIncomeBalance, 0),
  };

  const positive: Record<SavingsGroup, number> = {
    gains: Math.max(0, balances.gains),
    capitalIncome: Math.max(0, balances.capitalIncome),
  };
  const crossBudget: Record<SavingsGroup, number> = {
    gains: positive.gains * SAVINGS_CROSS_COMPENSATION_LIMIT,
    capitalIncome: positive.capitalIncome * SAVINGS_CROSS_COMPENSATION_LIMIT,
  };
  const grossPositive = positive.gains + positive.capitalIncome;

  const own: NegativeItem[] = [];
  for (const kind of ["gains", "capitalIncome"] as const) {
    if (balances[kind] < 0) own.push({ kind, originYear: year, remaining: -balances[kind] });
  }

  const expired: PendingNegative[] = [];
  const prior: NegativeItem[] = [];
  const oldestUsable = year - SAVINGS_CARRYFORWARD_YEARS;
  for (const p of input.pending) {
    if (!finitePositive(p.amount) || p.originYear >= year) continue;
    if (p.originYear < oldestUsable) expired.push({ ...p });
    else prior.push({ kind: p.kind, originYear: p.originYear, remaining: p.amount });
  }
  // Stable: for the same year, GPP before RCM, so the result does not depend on the input order.
  prior.sort((a, b) => a.originYear - b.originYear || (a.kind === b.kind ? 0 : a.kind === "gains" ? -1 : 1));

  const compensations: SavingsCompensation[] = [];
  const applySame = (item: NegativeItem): void => {
    const same = Math.min(item.remaining, positive[item.kind]);
    if (same <= EPSILON) return;
    positive[item.kind] -= same;
    item.remaining -= same;
    compensations.push({
      source: { kind: item.kind, originYear: item.originYear },
      target: item.kind,
      amount: same,
      cross: false,
    });
  };
  const applyCross = (item: NegativeItem): void => {
    const target = other(item.kind);
    const cross = Math.min(item.remaining, positive[target], crossBudget[target]);
    if (cross <= EPSILON) return;
    positive[target] -= cross;
    crossBudget[target] -= cross;
    item.remaining -= cross;
    compensations.push({
      source: { kind: item.kind, originYear: item.originYear },
      target,
      amount: cross,
      cross: true,
    });
  };
  // Order of the Manual práctico de Renta 2025 (ch. 12): first the current tax year's negative
  // balance against the other group; then ALL pending balances against their own group (no limit)
  // and, finally, against the other group with what is left of the 25% allowance, which is a
  // single one per group.
  own.forEach(applyCross);
  prior.forEach(applySame);
  prior.forEach(applyCross);

  const pending: PendingNegative[] = [...prior, ...own]
    .filter((item) => item.remaining > EPSILON)
    .sort((a, b) => a.originYear - b.originYear)
    .map((item) => ({ originYear: item.originYear, kind: item.kind, amount: item.remaining }));

  const base = Math.max(0, positive.gains + positive.capitalIncome);
  return {
    base,
    compensations,
    totalCompensated: Math.max(0, grossPositive - base),
    pending,
    expired,
  };
}
