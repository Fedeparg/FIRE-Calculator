// Impuesto sobre Donaciones (ISD). Estimación con la tarifa estatal supletoria
// y el coeficiente multiplicador por grupo de parentesco. Core puro.
//
// MUY orientativo: el ISD está cedido a las CCAA, que aplican grandes
// bonificaciones (Madrid ~99 %, etc.) y reducciones propias. El resultado real
// depende decisivamente de tu Comunidad Autónoma.

import { ISD_ESTATAL, applyProgressiveBrackets } from "@sextante/core/fiscal/brackets";

/** Grupos de parentesco del ISD, en el orden en que se ofrecen en el desplegable. */
export const KINSHIP_GROUPS = ["grupoI_II", "grupoIII", "grupoIV"] as const;
export type KinshipGroup = (typeof KINSHIP_GROUPS)[number];

/**
 * Umbrales de patrimonio preexistente (€) que delimitan los cuatro tramos de la
 * tabla de coeficientes multiplicadores. Ley 29/1987, art. 22.2. El límite
 * superior se incluye en su tramo (p. ej. 402.678,11 € pertenece al primer tramo).
 */
const WEALTH_TIERS = [402678.11, 2007380.43, 4020770.98] as const;

/**
 * Coeficiente multiplicador por grupo de parentesco y tramo de patrimonio
 * preexistente del adquirente (Ley 29/1987, art. 22.2). Cuatro tramos (índices
 * 0-3 según `WEALTH_TIERS`) × tres grupos:
 * - Grupos I y II: cónyuge, descendientes, ascendientes.
 * - Grupo III: colaterales de 2.º y 3.º grado (hermanos, tíos, sobrinos), afines.
 * - Grupo IV: colaterales de 4.º grado o más, extraños.
 */
export const KINSHIP_COEFFICIENTS: Record<KinshipGroup, readonly [number, number, number, number]> = {
  grupoI_II: [1.0, 1.05, 1.1, 1.2],
  grupoIII: [1.5882, 1.6676, 1.7471, 1.9059],
  grupoIV: [2.0, 2.1, 2.2, 2.4],
};

/**
 * Coeficiente multiplicador aplicable a un grupo de parentesco según el
 * patrimonio preexistente del adquirente. Art. 22.2 Ley 29/1987.
 */
export function kinshipCoefficient(kinship: KinshipGroup, preexistingWealth: number): number {
  const wealth = Math.max(0, Number.isFinite(preexistingWealth) ? preexistingWealth : 0);
  let tier = 0;
  while (tier < WEALTH_TIERS.length && wealth > WEALTH_TIERS[tier]) tier++;
  return KINSHIP_COEFFICIENTS[kinship][tier];
}

export interface GiftTaxInput {
  /** Valor de lo donado. */
  amount: number;
  /** Reducciones aplicables (varían por CCAA). Por defecto 0. */
  reduction?: number;
  /** Grupo de parentesco (coeficiente multiplicador). */
  kinship?: KinshipGroup;
  /**
   * Patrimonio preexistente del adquirente (€). Eleva el coeficiente
   * multiplicador a partir de 402.678,11 €. Por defecto 0 (primer tramo).
   */
  preexistingWealth?: number;
  /** Bonificación autonómica sobre la cuota (%). Por defecto 0. */
  regionalRebate?: number;
}

export interface GiftTaxResult {
  /** Base liquidable (donado − reducciones). */
  taxableBase: number;
  /** Cuota íntegra (tarifa estatal). */
  grossTax: number;
  /** Coeficiente multiplicador aplicado (según parentesco y patrimonio preexistente). */
  coefficient: number;
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
