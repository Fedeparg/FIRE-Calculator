// Impuesto sobre Donaciones (ISD): tarifa estatal supletoria por coeficiente de parentesco. Core puro.
// Muy orientativo: el ISD está cedido a las CCAA, que aplican bonificaciones (Madrid ~99 %) y
// reducciones propias.

import { ISD_ESTATAL, applyProgressiveBrackets } from "../fiscal/brackets.js";

export const KINSHIP_GROUPS = ["grupoI_II", "grupoIII", "grupoIV"] as const;
export type KinshipGroup = (typeof KINSHIP_GROUPS)[number];

/** Umbrales de patrimonio preexistente (€) de los cuatro tramos (Ley 29/1987, art. 22.2); el límite superior entra en su tramo. */
const WEALTH_TIERS = [402678.11, 2007380.43, 4020770.98] as const;

/**
 * Coeficiente multiplicador por grupo y tramo de patrimonio (Ley 29/1987, art. 22.2). Grupos I y II:
 * cónyuge, descendientes, ascendientes; III: colaterales de 2.º y 3.º grado y afines; IV: resto.
 */
export const KINSHIP_COEFFICIENTS: Record<KinshipGroup, readonly [number, number, number, number]> = {
  grupoI_II: [1.0, 1.05, 1.1, 1.2],
  grupoIII: [1.5882, 1.6676, 1.7471, 1.9059],
  grupoIV: [2.0, 2.1, 2.2, 2.4],
};

/** Coeficiente multiplicador según parentesco y patrimonio preexistente (art. 22.2 Ley 29/1987). */
export function kinshipCoefficient(kinship: KinshipGroup, preexistingWealth: number): number {
  const wealth = Math.max(0, Number.isFinite(preexistingWealth) ? preexistingWealth : 0);
  let tier = 0;
  while (tier < WEALTH_TIERS.length && wealth > WEALTH_TIERS[tier]) tier++;
  return KINSHIP_COEFFICIENTS[kinship][tier];
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
  const grossTax = applyProgressiveBrackets(taxableBase, ISD_ESTATAL);
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
