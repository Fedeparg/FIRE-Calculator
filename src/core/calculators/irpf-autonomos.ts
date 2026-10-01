// IRPF de autónomos (estimación directa). A partir de ingresos, gastos y cuota
// de autónomos, estima el rendimiento neto y el IRPF, contemplando la situación
// personal y familiar (mínimo personal y familiar y tributación conjunta).
// Core puro. Orientativo.
//
// Reutiliza el motor fiscal compartido (`core/fiscal/*`): el mínimo personal y
// familiar y la cuota por doble escala. Contempla, en estimación directa
// simplificada, los "gastos de difícil justificación" (5 % del rendimiento neto
// previo, máx. 2.000 €/año; art. 30 Reglamento IRPF). No incluye la reducción por
// rendimientos del trabajo (art. 20 LIRPF), que NO aplica a actividades económicas.

import {
  REDUCCION_TRIBUTACION_CONJUNTA,
  SELF_EMPLOYED_DIFFICULT_EXPENSES_CAP,
  SELF_EMPLOYED_DIFFICULT_EXPENSES_RATE,
} from "@sextante/core/fiscal/brackets";
import {
  generalIncomeTax,
  generalMarginalRate,
  personalAndFamilyMinimum,
  regionalPersonalAndFamilyMinimum,
  type PersonalCircumstances,
} from "@sextante/core/fiscal/irpf";

export interface SelfEmployedInput extends PersonalCircumstances {
  /** Ingresos anuales de la actividad. */
  income: number;
  /** Gastos deducibles anuales (sin contar la cuota de autónomos). */
  expenses: number;
  /** Cuota anual de autónomos pagada a la Seguridad Social (deducible). */
  socialSecurity: number;
  /** Aportación anual a plan de pensiones (reduce la base). Por defecto 0. */
  pensionContribution?: number;
  /**
   * Estimación directa simplificada: aplica el 5 % de gastos de difícil
   * justificación (máx. 2.000 €/año). Por defecto false (estimación directa normal).
   */
  simplifiedRegime?: boolean;
}

export interface SelfEmployedResult {
  /** Rendimiento neto previo (ingresos − gastos − cuota autónomos). */
  grossNetIncome: number;
  /** Gastos de difícil justificación aplicados (solo estimación directa simplificada). */
  difficultExpenses: number;
  /** Rendimiento neto de la actividad tras los gastos de difícil justificación. */
  netIncome: number;
  /** Mínimo personal y familiar estatal aplicado (ver `core/fiscal/irpf.ts`). */
  personalMinimum: number;
  /** Base liquidable general (tras aportación a plan y reducción conjunta). */
  taxableBase: number;
  /** Cuota de IRPF anual estimada. */
  incomeTax: number;
  /** Rendimiento neto tras IRPF. */
  netAfterTax: number;
  /** Tipo efectivo de IRPF sobre el rendimiento neto (%). */
  effectiveRate: number;
  /** Tipo marginal de IRPF (%). */
  marginalRate: number;
}

export function computeSelfEmployedTax(input: SelfEmployedInput): SelfEmployedResult {
  const income = Math.max(0, input.income || 0);
  const expenses = Math.max(0, input.expenses || 0);
  const socialSecurity = Math.max(0, input.socialSecurity || 0);
  const pension = Math.max(0, input.pensionContribution || 0);

  const grossNetIncome = Math.max(0, income - expenses - socialSecurity);
  const difficultExpenses = input.simplifiedRegime
    ? Math.min(
        grossNetIncome * (SELF_EMPLOYED_DIFFICULT_EXPENSES_RATE / 100),
        SELF_EMPLOYED_DIFFICULT_EXPENSES_CAP,
      )
    : 0;
  const netIncome = Math.max(0, grossNetIncome - difficultExpenses);

  const jointReduction = input.jointReturn ? REDUCCION_TRIBUTACION_CONJUNTA : 0;
  const taxableBase = Math.max(0, netIncome - pension - jointReduction);

  const personalMinimum = personalAndFamilyMinimum(input);
  const incomeTax = generalIncomeTax(taxableBase, personalMinimum, {
    region: input.region,
    regionalMinimum: regionalPersonalAndFamilyMinimum(input),
  });

  return {
    grossNetIncome,
    difficultExpenses,
    netIncome,
    personalMinimum,
    taxableBase,
    incomeTax,
    netAfterTax: netIncome - incomeTax,
    effectiveRate: netIncome > 0 ? (incomeTax / netIncome) * 100 : 0,
    marginalRate: generalMarginalRate(taxableBase, input.region),
  };
}
