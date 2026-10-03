// Early mortgage repayment: compares lowering the payment (same term) or the term (same payment), including
// the early-repayment fee. Pure core.

import { amortizationSchedule, monthlyRate } from "./amortization.js";
import { computeMortgage } from "./hipoteca.js";
import { clampYears } from "../inputs.js";

export interface EarlyRepaymentInput {
  pendingPrincipal: number;
  annualRate: number;
  remainingYears: number;
  extraPayment: number;
  /**
   * Fee as a % of the repaid principal (capped by law, e.g. 2% on fixed rates during the first 10 years); paid
   * separately. Defaults to 0.
   */
  compensationRate?: number;
}

export interface EarlyRepaymentResult {
  monthlyPaymentBefore: number;
  totalInterestBefore: number;
  prepaymentFee: number;
  /** Option A: same term, lower payment. */
  reducePayment: { newMonthlyPayment: number; interestSaved: number; netSaved: number };
  /** Option B: same payment, fewer months. */
  reduceTerm: { newMonths: number; monthsSaved: number; interestSaved: number; netSaved: number };
}

export function computeEarlyRepayment(input: EarlyRepaymentInput): EarlyRepaymentResult {
  const pending = Math.max(0, input.pendingPrincipal || 0);
  const remainingYears = clampYears(input.remainingYears, 1);
  const i = monthlyRate(input.annualRate);
  const totalMonths = remainingYears * 12;
  const extra = Math.min(pending, Math.max(0, input.extraPayment || 0));
  const newPrincipal = pending - extra;
  const compensationRate = Math.max(0, input.compensationRate || 0);
  const prepaymentFee = extra * (compensationRate / 100);

  const base = computeMortgage({
    principal: pending,
    annualRate: input.annualRate,
    years: remainingYears,
  });
  const monthlyPaymentBefore = base.monthlyPayment;
  const totalInterestBefore = base.totalInterest;

  // Option A: lower the payment (same term)
  const afterPayment = computeMortgage({
    principal: newPrincipal,
    annualRate: input.annualRate,
    years: remainingYears,
  });
  const reducePaymentInterestSaved = totalInterestBefore - afterPayment.totalInterest;
  const reducePayment = {
    newMonthlyPayment: afterPayment.monthlyPayment,
    interestSaved: reducePaymentInterestSaved,
    netSaved: reducePaymentInterestSaved - prepaymentFee,
  };

  // Option B: shorten the term; simulated month by month (partial last payment) so months and interest agree
  let newMonths = 0;
  let interestAfterTerm = 0;
  for (const { balanceBefore, interest, principalPart } of amortizationSchedule(
    newPrincipal,
    i,
    monthlyPaymentBefore,
    totalMonths,
  )) {
    if (!(balanceBefore > 0.005)) break; // balance paid off
    if (principalPart <= 0) break; // the payment does not even cover the interest
    interestAfterTerm += interest;
    newMonths++;
  }
  const reduceTermInterestSaved = totalInterestBefore - interestAfterTerm;
  const reduceTerm = {
    newMonths,
    monthsSaved: totalMonths - newMonths,
    interestSaved: reduceTermInterestSaved,
    netSaved: reduceTermInterestSaved - prepaymentFee,
  };

  return { monthlyPaymentBefore, totalInterestBefore, prepaymentFee, reducePayment, reduceTerm };
}
