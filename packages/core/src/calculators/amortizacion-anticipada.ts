// Amortización anticipada: compara reducir cuota (mismo plazo) o plazo (misma cuota), con la comisión por amortización anticipada. Core puro.

import { amortizationSchedule, monthlyRate } from "./amortization.js";
import { computeMortgage } from "./hipoteca.js";

export interface EarlyRepaymentInput {
  pendingPrincipal: number;
  annualRate: number;
  remainingYears: number;
  extraPayment: number;
  /** Comisión como % del capital amortizado (la ley la limita, p. ej. 2 % en tipo fijo los 10 primeros años); se paga aparte. Por defecto 0. */
  compensationRate?: number;
}

export interface EarlyRepaymentResult {
  monthlyPaymentBefore: number;
  totalInterestBefore: number;
  prepaymentFee: number;
  /** Opción A: misma duración, cuota más baja. */
  reducePayment: { newMonthlyPayment: number; interestSaved: number; netSaved: number };
  /** Opción B: misma cuota, menos meses. */
  reduceTerm: { newMonths: number; monthsSaved: number; interestSaved: number; netSaved: number };
}

export function computeEarlyRepayment(input: EarlyRepaymentInput): EarlyRepaymentResult {
  const pending = Math.max(0, input.pendingPrincipal || 0);
  const remainingYears = Math.max(1, Math.round(input.remainingYears || 1));
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

  // Opción A: reducir cuota (mismo plazo)
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

  // Opción B: reducir plazo; se simula mes a mes (último pago parcial) para que meses e intereses sean coherentes
  let newMonths = 0;
  let interestAfterTerm = 0;
  for (const { balanceBefore, interest, principalPart } of amortizationSchedule(
    newPrincipal,
    i,
    monthlyPaymentBefore,
    totalMonths,
  )) {
    if (!(balanceBefore > 0.005)) break; // saldo liquidado
    if (principalPart <= 0) break; // la cuota no cubre ni los intereses
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
