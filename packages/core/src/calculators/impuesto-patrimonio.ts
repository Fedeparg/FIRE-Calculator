// Wealth tax (Impuesto sobre el Patrimonio). Estimate using the fallback state scale.
// Pure core. Indicative only: many CCAA grant rebates or modify the scale.

import {
  WEALTH_TAX_STATE_SCALE,
  WEALTH_TAX_EXEMPT_MINIMUM,
  WEALTH_TAX_PRIMARY_RESIDENCE_EXEMPTION,
  applyProgressiveBrackets,
} from "../fiscal/brackets.js";

export interface WealthTaxInput {
  totalWealth: number;
  primaryResidenceValue: number;
  /** Tax-exempt minimum (varies by CCAA). Defaults to €700,000. */
  exemptMinimum?: number;
  /** Regional rebate on the tax due (%), e.g. Madrid ~100. */
  regionalRebate?: number;
}

export interface WealthTaxResult {
  residenceExemption: number;
  taxableBase: number;
  grossTax: number;
  tax: number;
  effectiveRate: number;
}

export function computeWealthTax(input: WealthTaxInput): WealthTaxResult {
  const totalWealth = Math.max(0, input.totalWealth || 0);
  const residence = Math.max(0, input.primaryResidenceValue || 0);
  const exemptMinimum = Math.max(0, input.exemptMinimum ?? WEALTH_TAX_EXEMPT_MINIMUM);
  const rebate = Math.min(100, Math.max(0, input.regionalRebate || 0));

  const residenceExemption = Math.min(residence, WEALTH_TAX_PRIMARY_RESIDENCE_EXEMPTION);
  const taxableBase = Math.max(0, totalWealth - residenceExemption - exemptMinimum);
  const grossTax = applyProgressiveBrackets(taxableBase, WEALTH_TAX_STATE_SCALE);
  const tax = grossTax * (1 - rebate / 100);

  return {
    residenceExemption,
    taxableBase,
    grossTax,
    tax,
    effectiveRate: totalWealth > 0 ? (tax / totalWealth) * 100 : 0,
  };
}
