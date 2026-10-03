// Self-employed IRPF (direct assessment, estimación directa): net income and IRPF with the personal
// and family allowance (mínimo personal y familiar) and joint filing (tributación conjunta). Pure core,
// indicative only. The simplified variant applies the hard-to-justify expenses allowance (gastos de
// difícil justificación: 5% of prior net income, max €2,000/year; art. 30 Reglamento IRPF). It does
// not apply the employment income reduction (art. 20 LIRPF), which does not cover business activities.

import {
  JOINT_RETURN_REDUCTION,
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
  /** Simplified direct assessment: hard-to-justify expenses allowance (5%, max €2,000/year). Defaults to false. */
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

  const jointReduction = input.jointReturn ? JOINT_RETURN_REDUCTION : 0;
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
