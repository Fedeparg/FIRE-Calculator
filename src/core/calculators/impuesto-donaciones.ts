// Impuesto sobre Donaciones (ISD). Estimación con la tarifa estatal supletoria
// y el coeficiente multiplicador por grupo de parentesco. Core puro.
//
// MUY orientativo: el ISD está cedido a las CCAA, que aplican grandes
// bonificaciones (Madrid ~99 %, etc.) y reducciones propias. El resultado real
// depende decisivamente de tu Comunidad Autónoma.

import { ISD_ESTATAL, applyProgressiveBrackets } from "../fiscal/brackets";

/**
 * Coeficiente multiplicador por grupo de parentesco, para patrimonio
 * preexistente hasta 402.678,11 € (Ley 29/1987, art. 22).
 * - Grupos I y II (cónyuge, hijos, padres): 1,0000
 * - Grupo III (hermanos, tíos, sobrinos…): 1,5882
 * - Grupo IV (primos, extraños): 2,0000
 */
export const KINSHIP_COEFFICIENTS = {
  grupoI_II: 1.0,
  grupoIII: 1.5882,
  grupoIV: 2.0,
} as const;

export type KinshipGroup = keyof typeof KINSHIP_COEFFICIENTS;

export interface GiftTaxInput {
  /** Valor de lo donado. */
  amount: number;
  /** Reducciones aplicables (varían por CCAA). Por defecto 0. */
  reduction?: number;
  /** Grupo de parentesco (coeficiente multiplicador). */
  kinship?: KinshipGroup;
  /** Bonificación autonómica sobre la cuota (%). Por defecto 0. */
  regionalRebate?: number;
}

export interface GiftTaxResult {
  /** Base liquidable (donado − reducciones). */
  taxableBase: number;
  /** Cuota íntegra (tarifa estatal). */
  grossTax: number;
  /** Cuota tras coeficiente multiplicador, antes de bonificación. */
  adjustedTax: number;
  /** Cuota final tras bonificación autonómica. */
  tax: number;
  /** Tipo efectivo sobre lo donado (%). */
  effectiveRate: number;
}

export function computeGiftTax(input: GiftTaxInput): GiftTaxResult {
  const amount = Math.max(0, input.amount || 0);
  const reduction = Math.max(0, input.reduction || 0);
  const coefficient = KINSHIP_COEFFICIENTS[input.kinship ?? "grupoI_II"];
  const rebate = Math.min(100, Math.max(0, input.regionalRebate || 0));

  const taxableBase = Math.max(0, amount - reduction);
  const grossTax = applyProgressiveBrackets(taxableBase, ISD_ESTATAL);
  const adjustedTax = grossTax * coefficient;
  const tax = adjustedTax * (1 - rebate / 100);

  return {
    taxableBase,
    grossTax,
    adjustedTax,
    tax,
    effectiveRate: amount > 0 ? (tax / amount) * 100 : 0,
  };
}
