// Cuota de la escala del ahorro (art. 66 y 76 LIRPF, `IRPF_AHORRO`): la única implementación,
// que usan la base del ahorro del informe de la Renta (`savingsTax`) y la estimación de una
// ganancia aislada (`estimateSavingsTax`: simulador de venta y resumen de plusvalías). Core puro.

import { nonNegative } from "../inputs.js";
import { applyProgressiveBrackets, IRPF_AHORRO, marginalRate } from "./brackets.js";

export interface SavingsTax {
  /** Cuota íntegra de la escala del ahorro. */
  readonly tax: number;
  /** Tipo medio efectivo en % (cuota / base × 100); `null` si la base es 0. */
  readonly averageRatePct: number | null;
}

/** Aplica la escala del ahorro (`IRPF_AHORRO`) a la base liquidable. */
export function savingsTax(base: number): SavingsTax {
  const b = nonNegative(base);
  if (b === 0) return { tax: 0, averageRatePct: null };
  const tax = applyProgressiveBrackets(b, IRPF_AHORRO);
  return { tax, averageRatePct: (tax / b) * 100 };
}

/** Estimación de la cuota del ahorro de una ganancia patrimonial aislada. */
export interface SavingsTaxEstimate {
  /** Base del ahorro considerada: la ganancia, o 0 si la operación da pérdida. */
  base: number;
  /** Cuota estimada aplicando `IRPF_AHORRO` por tramos. */
  tax: number;
  /** Ganancia después de impuestos (`gain − tax`). Con pérdida, la propia pérdida. */
  net: number;
  /** Tipo efectivo en %, o `null` si no hay base positiva sobre la que calcularlo. */
  effectiveRate: number | null;
  /** Tipo marginal en % del último euro de la base. */
  marginal: number;
}

/** Cuota del IRPF del ahorro de una ganancia aislada, en euros; una pérdida da 0 (no se compensa, ver README). */
export function estimateSavingsTax(gain: number): SavingsTaxEstimate {
  if (!Number.isFinite(gain)) {
    return { base: NaN, tax: NaN, net: NaN, effectiveRate: null, marginal: NaN };
  }
  const base = Math.max(0, gain);
  const { tax, averageRatePct } = savingsTax(base);
  return { base, tax, net: gain - tax, effectiveRate: averageRatePct, marginal: marginalRate(base, IRPF_AHORRO) };
}
