// Impuesto sobre Donaciones (ISD): tarifa estatal supletoria por coeficiente de parentesco. Core puro.
// Muy orientativo: el ISD está cedido a las CCAA, que aplican bonificaciones (Madrid ~99 %) y
// reducciones propias.

import { itemAt } from "../arrays.js";
import { nonNegative } from "../inputs.js";
import {
  GIFT_TAX_KINSHIP_COEFFICIENTS,
  GIFT_TAX_WEALTH_TIERS,
  GIFT_TAX_STATE_SCALE,
  applyProgressiveBrackets,
} from "../fiscal/brackets.js";

export const KINSHIP_GROUPS = ["grupoI_II", "grupoIII", "grupoIV"] as const;
export type KinshipGroup = (typeof KINSHIP_GROUPS)[number];

/** Coeficientes por grupo (tabla en `brackets.ts`); el tipo exige uno por cada grupo de `KINSHIP_GROUPS`. */
const KINSHIP_COEFFICIENTS: Record<KinshipGroup, readonly [number, number, number, number]> =
  GIFT_TAX_KINSHIP_COEFFICIENTS;

/** Coeficiente multiplicador según parentesco y patrimonio preexistente (art. 22.2 Ley 29/1987). */
export function kinshipCoefficient(kinship: KinshipGroup, preexistingWealth: number): number {
  const wealth = nonNegative(preexistingWealth);
  let tier = 0;
  while (tier < GIFT_TAX_WEALTH_TIERS.length && wealth > itemAt(GIFT_TAX_WEALTH_TIERS, tier)) tier++;
  // Hay un coeficiente más que umbrales, así que `tier` (0…umbrales) siempre tiene el suyo.
  return itemAt(KINSHIP_COEFFICIENTS[kinship], tier);
}

export interface GiftTaxInput {
  amount: number;
  reduction?: number;
  kinship?: KinshipGroup;
  /** Patrimonio preexistente (€); eleva el coeficiente desde 402.678,11 €. */
  preexistingWealth?: number;
  regionalRebate?: number;
}

export interface GiftTaxResult {
  taxableBase: number;
  grossTax: number;
  coefficient: number;
  adjustedTax: number;
  tax: number;
  effectiveRate: number;
}

export function computeGiftTax(input: GiftTaxInput): GiftTaxResult {
  const amount = Math.max(0, input.amount || 0);
  const reduction = Math.max(0, input.reduction || 0);
  const coefficient = kinshipCoefficient(input.kinship ?? "grupoI_II", input.preexistingWealth ?? 0);
  const rebate = Math.min(100, Math.max(0, input.regionalRebate || 0));

  const taxableBase = Math.max(0, amount - reduction);
  const grossTax = applyProgressiveBrackets(taxableBase, GIFT_TAX_STATE_SCALE);
  const adjustedTax = grossTax * coefficient;
  const tax = adjustedTax * (1 - rebate / 100);

  return {
    taxableBase,
    grossTax,
    coefficient,
    adjustedTax,
    tax,
    effectiveRate: amount > 0 ? (tax / amount) * 100 : 0,
  };
}
