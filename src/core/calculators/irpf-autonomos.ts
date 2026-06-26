// IRPF de autónomos (estimación directa). A partir de ingresos, gastos y cuota
// de autónomos, estima el rendimiento neto y el IRPF, contemplando la situación
// personal y familiar (mínimo personal y familiar y tributación conjunta).
// Core puro. Orientativo.
//
// Reutiliza el motor fiscal compartido (`core/fiscal/*`): el mínimo personal y
// familiar y la cuota por doble escala. No incorpora reducciones específicas de
// actividades económicas (p. ej. gastos de difícil justificación), ni la
// reducción por rendimientos del trabajo (art. 20 LIRPF), que NO aplica a
// actividades económicas.

import { IRPF_GENERAL, REDUCCION_TRIBUTACION_CONJUNTA, marginalRate } from "../fiscal/brackets";
import { generalIncomeTax, personalAndFamilyMinimum, type PersonalCircumstances } from "../fiscal/irpf";

export interface SelfEmployedInput extends PersonalCircumstances {
  /** Ingresos anuales de la actividad. */
  income: number;
  /** Gastos deducibles anuales (sin contar la cuota de autónomos). */
  expenses: number;
  /** Cuota anual de autónomos pagada a la Seguridad Social (deducible). */
  socialSecurity: number;
  /** Aportación anual a plan de pensiones (reduce la base). Por defecto 0. */
  pensionContribution?: number;
}

export interface SelfEmployedResult {
  /** Rendimiento neto de la actividad (ingresos − gastos − cuota autónomos). */
  netIncome: number;
  /** Mínimo personal y familiar aplicado. */
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

  const netIncome = Math.max(0, income - expenses - socialSecurity);

  const jointReduction = input.jointReturn ? REDUCCION_TRIBUTACION_CONJUNTA : 0;
  const taxableBase = Math.max(0, netIncome - pension - jointReduction);

  const personalMinimum = personalAndFamilyMinimum(input);
  const incomeTax = generalIncomeTax(taxableBase, personalMinimum);

  return {
    netIncome,
    personalMinimum,
    taxableBase,
    incomeTax,
    netAfterTax: netIncome - incomeTax,
    effectiveRate: netIncome > 0 ? (incomeTax / netIncome) * 100 : 0,
    marginalRate: marginalRate(taxableBase, IRPF_GENERAL),
  };
}
