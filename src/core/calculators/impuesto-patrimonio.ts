// Impuesto sobre el Patrimonio. Estimación con la escala estatal supletoria.
// Core puro. Orientativo: muchas CCAA bonifican o modifican la escala.

import { PATRIMONIO_ESTATAL, applyProgressiveBrackets } from "@sextante/core/fiscal/brackets";

/** Mínimo exento estatal por defecto. */
export const DEFAULT_EXEMPT_MINIMUM = 700000;
/** Exención máxima de la vivienda habitual. */
export const PRIMARY_RESIDENCE_EXEMPTION = 300000;

export interface WealthTaxInput {
  /** Patrimonio neto total (bienes y derechos − deudas). */
  totalWealth: number;
  /** Valor de la vivienda habitual (exenta hasta 300.000 €). */
  primaryResidenceValue: number;
  /** Mínimo exento (varía por CCAA). Por defecto 700.000 €. */
  exemptMinimum?: number;
  /** Bonificación autonómica sobre la cuota (%), p. ej. Madrid ~100. */
  regionalRebate?: number;
}

export interface WealthTaxResult {
  /** Exención aplicada a la vivienda habitual. */
  residenceExemption: number;
  /** Base liquidable (tras vivienda y mínimo exento). */
  taxableBase: number;
  /** Cuota antes de bonificación autonómica. */
  grossTax: number;
  /** Cuota final tras bonificación. */
  tax: number;
  /** Tipo efectivo sobre el patrimonio total (%). */
  effectiveRate: number;
}

export function computeWealthTax(input: WealthTaxInput): WealthTaxResult {
  const totalWealth = Math.max(0, input.totalWealth || 0);
  const residence = Math.max(0, input.primaryResidenceValue || 0);
  const exemptMinimum = Math.max(0, input.exemptMinimum ?? DEFAULT_EXEMPT_MINIMUM);
  const rebate = Math.min(100, Math.max(0, input.regionalRebate || 0));

  const residenceExemption = Math.min(residence, PRIMARY_RESIDENCE_EXEMPTION);
  const taxableBase = Math.max(0, totalWealth - residenceExemption - exemptMinimum);
  const grossTax = applyProgressiveBrackets(taxableBase, PATRIMONIO_ESTATAL);
  const tax = grossTax * (1 - rebate / 100);

  return {
    residenceExemption,
    taxableBase,
    grossTax,
    tax,
    effectiveRate: totalWealth > 0 ? (tax / totalWealth) * 100 : 0,
  };
}
