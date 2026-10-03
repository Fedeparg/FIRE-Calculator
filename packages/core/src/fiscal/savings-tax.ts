// Savings-scale tax (arts. 66 and 76 LIRPF, `IRPF_SAVINGS_SCALE`): the single implementation, used
// by the savings base (base del ahorro) of the tax return report (`savingsTax`) and by the estimate
// for an isolated gain (`estimateSavingsTax`: sale simulator and capital-gains summary). Pure core
// module.

import { nonNegative } from "../inputs.js";
import { applyProgressiveBrackets, IRPF_SAVINGS_SCALE, marginalRate } from "./brackets.js";

export interface SavingsTax {
  /** Gross tax liability (cuota íntegra) under the savings scale. */
  readonly tax: number;
  /** Average effective rate in % (tax / base × 100); `null` if the base is 0. */
  readonly averageRatePct: number | null;
}

/** Applies the savings scale (`IRPF_SAVINGS_SCALE`) to the taxable base. */
export function savingsTax(base: number): SavingsTax {
  const b = nonNegative(base);
  if (b === 0) return { tax: 0, averageRatePct: null };
  const tax = applyProgressiveBrackets(b, IRPF_SAVINGS_SCALE);
  return { tax, averageRatePct: (tax / b) * 100 };
}

/** Savings-tax estimate for an isolated capital gain. */
export interface SavingsTaxEstimate {
  /** Savings base considered: the gain, or 0 if the transaction makes a loss. */
  base: number;
  /** Estimated tax applying `IRPF_SAVINGS_SCALE` by brackets. */
  tax: number;
  /** After-tax gain (`gain − tax`). With a loss, the loss itself. */
  net: number;
  /** Effective rate in %, or `null` if there is no positive base to compute it on. */
  effectiveRate: number | null;
  /** Marginal rate in % of the last euro of the base. */
  marginal: number;
}

/** IRPF savings tax on an isolated gain, in euros; a loss gives 0 (it is not offset, see README). */
export function estimateSavingsTax(gain: number): SavingsTaxEstimate {
  if (!Number.isFinite(gain)) {
    return { base: NaN, tax: NaN, net: NaN, effectiveRate: null, marginal: NaN };
  }
  const base = Math.max(0, gain);
  const { tax, averageRatePct } = savingsTax(base);
  return {
    base,
    tax,
    net: gain - tax,
    effectiveRate: averageRatePct,
    marginal: marginalRate(base, IRPF_SAVINGS_SCALE),
  };
}
