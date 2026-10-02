// Integración y compensación de la base imponible del ahorro (arts. 46, 48 y 49 LIRPF).
// Core puro: no traduce, los resultados son cifras y códigos. Alcance: ver ./README.md.

import { applyProgressiveBrackets, IRPF_AHORRO } from "./brackets.js";

/** Grupo de renta del ahorro: ganancias y pérdidas patrimoniales (GPP) o rendimientos del capital mobiliario (RCM). */
export type SavingsGroup = "gains" | "capitalIncome";

/** Límite de la compensación cruzada entre grupos: 25 % del saldo positivo (art. 49.1 LIRPF, desde 2018). */
export const SAVINGS_CROSS_COMPENSATION_LIMIT = 0.25;

/** Años siguientes en los que se puede compensar un saldo negativo (art. 49.1 LIRPF). */
export const SAVINGS_CARRYFORWARD_YEARS = 4;

/** Tolerancia para no arrastrar polvo de coma flotante como si fuera un saldo pendiente. */
const EPSILON = 1e-9;

/** Saldo negativo de un ejercicio que aún se puede compensar. `amount` es positivo. */
export interface PendingNegative {
  readonly originYear: number;
  readonly kind: SavingsGroup;
  readonly amount: number;
}

export interface SavingsBaseInput {
  /** Ejercicio que se liquida. */
  readonly year: number;
  /** Saldo del ejercicio de GPP por transmisión (puede ser negativo). */
  readonly gainsBalance: number;
  /** Saldo neto del ejercicio de RCM (puede ser negativo). */
  readonly capitalIncomeBalance: number;
  /** Saldos negativos pendientes de ejercicios anteriores. */
  readonly pending: readonly PendingNegative[];
}

/** Una compensación aplicada: de qué saldo negativo, contra qué grupo positivo y cuánto. */
export interface SavingsCompensation {
  readonly source: { readonly kind: SavingsGroup; readonly originYear: number };
  readonly target: SavingsGroup;
  readonly amount: number;
  /** `true` si el saldo negativo y el positivo son de grupos distintos (sujeta al límite del 25 %). */
  readonly cross: boolean;
}

export interface SavingsBaseResult {
  /** Base liquidable del ahorro (≥ 0), sin la reducción del art. 55 LIRPF. */
  readonly base: number;
  readonly compensations: readonly SavingsCompensation[];
  readonly totalCompensated: number;
  /** Saldos negativos que siguen pendientes (incluye el remanente del propio ejercicio). */
  readonly pending: readonly PendingNegative[];
  /** Saldos negativos que han caducado sin compensar (origen anterior a ejercicio − 4). */
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
 * Integra y compensa la base del ahorro (art. 49 LIRPF).
 *
 * Orden: primero el saldo negativo del propio ejercicio contra el positivo del otro grupo
 * (25 %); después los pendientes de ejercicios anteriores del más antiguo al más reciente,
 * cada uno contra el positivo de su mismo grupo y, con lo que quede, contra el del otro
 * con el mismo 25 %. El 25 % es uno solo por grupo positivo y se calcula sobre su saldo
 * positivo del ejercicio antes de compensar. Las partidas con importe no finito o ≤ 0, o con
 * origen igual o posterior al ejercicio, se ignoran.
 */
export function computeSavingsBase(input: SavingsBaseInput): SavingsBaseResult {
  const { year } = input;
  const balances: Record<SavingsGroup, number> = {
    gains: Number.isFinite(input.gainsBalance) ? input.gainsBalance : 0,
    capitalIncome: Number.isFinite(input.capitalIncomeBalance) ? input.capitalIncomeBalance : 0,
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
  // Estable: a igual año, GPP antes que RCM, para que el resultado no dependa del orden de entrada.
  prior.sort((a, b) => a.originYear - b.originYear || (a.kind === b.kind ? 0 : a.kind === "gains" ? -1 : 1));

  const compensations: SavingsCompensation[] = [];
  const apply = (item: NegativeItem): void => {
    const source = { kind: item.kind, originYear: item.originYear };
    const same = Math.min(item.remaining, positive[item.kind]);
    if (same > EPSILON) {
      positive[item.kind] -= same;
      item.remaining -= same;
      compensations.push({ source, target: item.kind, amount: same, cross: false });
    }
    const target = other(item.kind);
    const cross = Math.min(item.remaining, positive[target], crossBudget[target]);
    if (cross > EPSILON) {
      positive[target] -= cross;
      crossBudget[target] -= cross;
      item.remaining -= cross;
      compensations.push({ source, target, amount: cross, cross: true });
    }
  };
  own.forEach(apply);
  prior.forEach(apply);

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

export interface SavingsTax {
  /** Cuota íntegra de la escala del ahorro. */
  readonly tax: number;
  /** Tipo medio efectivo en % (cuota / base × 100); `null` si la base es 0. */
  readonly averageRatePct: number | null;
}

/** Aplica la escala del ahorro (`IRPF_AHORRO`) a la base liquidable. */
export function savingsTax(base: number): SavingsTax {
  const b = Math.max(0, Number.isFinite(base) ? base : 0);
  if (b === 0) return { tax: 0, averageRatePct: null };
  const tax = applyProgressiveBrackets(b, IRPF_AHORRO);
  return { tax, averageRatePct: (tax / b) * 100 };
}
