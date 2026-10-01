// IRPF de autónomos (estimación directa): rendimiento neto e IRPF con mínimo personal y familiar y
// tributación conjunta. Core puro, orientativo. En la simplificada aplica los gastos de difícil
// justificación (5 % del rendimiento previo, máx. 2.000 €/año; art. 30 Reglamento IRPF). No aplica
// la reducción por rendimientos del trabajo (art. 20 LIRPF): no rige para actividades económicas.

import {
  REDUCCION_TRIBUTACION_CONJUNTA,
  SELF_EMPLOYED_DIFFICULT_EXPENSES_CAP,
  SELF_EMPLOYED_DIFFICULT_EXPENSES_RATE,
} from "../fiscal/brackets.js";
import {
  generalIncomeTax,
  generalMarginalRate,
  personalAndFamilyMinimum,
  regionalPersonalAndFamilyMinimum,
  type PersonalCircumstances,
} from "../fiscal/irpf.js";

export interface SelfEmployedInput extends PersonalCircumstances {
  income: number;
  expenses: number;
  socialSecurity: number;
  pensionContribution?: number;
  /** Estimación directa simplificada: gastos de difícil justificación (5 %, máx. 2.000 €/año). Por defecto false. */
  simplifiedRegime?: boolean;
}

export interface SelfEmployedResult {
  grossNetIncome: number;
  difficultExpenses: number;
  netIncome: number;
  personalMinimum: number;
  taxableBase: number;
  incomeTax: number;
  netAfterTax: number;
  effectiveRate: number;
  marginalRate: number;
}

export function computeSelfEmployedTax(input: SelfEmployedInput): SelfEmployedResult {
  const income = Math.max(0, input.income || 0);
  const expenses = Math.max(0, input.expenses || 0);
  const socialSecurity = Math.max(0, input.socialSecurity || 0);
  const pension = Math.max(0, input.pensionContribution || 0);

  const grossNetIncome = Math.max(0, income - expenses - socialSecurity);
  const difficultExpenses = input.simplifiedRegime
    ? Math.min(grossNetIncome * (SELF_EMPLOYED_DIFFICULT_EXPENSES_RATE / 100), SELF_EMPLOYED_DIFFICULT_EXPENSES_CAP)
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
