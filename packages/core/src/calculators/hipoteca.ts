// Fixed-rate mortgage (French amortization). Besides the payment and interest it estimates the TAE
// (APR) including the opening fee and tied insurance, the honest figure for comparing offers. Pure core.

import { amortizationSchedule, levelPayment, monthlyRate } from "./amortization.js";
import { clampYears } from "../inputs.js";

export interface MortgageInput {
  principal: number;
  annualRate: number;
  years: number;
  openingFeeRate?: number;
  /** Annual cost of the tied products required to get the rate; it counts toward the TAE. */
  annualInsurance?: number;
}

export interface MortgageYearPoint {
  year: number;
  principalPaid: number;
  interestPaid: number;
  balance: number;
}

export interface MortgageResult {
  monthlyPayment: number;
  totalPaid: number;
  totalInterest: number;
  openingCost: number;
  insuranceCost: number;
  totalCostWithFees: number;
  /** Estimated TAE, in base 100, including fee and insurance. Without them it equals (1 + TIN/12)^12 − 1. */
  apr: number;
  schedule: MortgageYearPoint[];
}

/**
 * Monthly rate `r` that equates the net amount received with the present value of the payments (bisection
 * over a monotonically decreasing function).
 */
function solveMonthlyIrr(netReceived: number, monthlyOutflow: number, n: number): number {
  if (netReceived <= 0 || monthlyOutflow <= 0 || n <= 0) return 0;

  const npv = (r: number): number => {
    if (r === 0) return monthlyOutflow * n - netReceived;
    let sum = 0;
    let factor = 1;
    for (let k = 1; k <= n; k++) {
      factor /= 1 + r;
      sum += monthlyOutflow * factor;
    }
    return sum - netReceived;
  };

  let lo = 0;
  let hi = 1; // 100% monthly: a generous upper bound
  for (let iter = 0; iter < 100; iter++) {
    const mid = (lo + hi) / 2;
    if (npv(mid) > 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export function computeMortgage(input: MortgageInput): MortgageResult {
  const principal = Math.max(0, input.principal || 0);
  const years = clampYears(input.years, 1);
  const n = years * 12;
  const i = monthlyRate(input.annualRate);
  const openingFeeRate = Math.max(0, input.openingFeeRate || 0);
  const annualInsurance = Math.max(0, input.annualInsurance || 0);

  const monthlyPayment = levelPayment(principal, i, n);

  const schedule: MortgageYearPoint[] = [];
  let yearPrincipal = 0;
  let yearInterest = 0;

  for (const { month, interest, principalPart, balanceAfter } of amortizationSchedule(
    principal,
    i,
    monthlyPayment,
    n,
  )) {
    yearPrincipal += principalPart;
    yearInterest += interest;

    if (month % 12 === 0 || month === n) {
      schedule.push({
        year: Math.ceil(month / 12),
        principalPaid: yearPrincipal,
        interestPaid: yearInterest,
        balance: balanceAfter,
      });
      yearPrincipal = 0;
      yearInterest = 0;
    }
  }

  const totalPaid = monthlyPayment * n;
  const openingCost = principal * (openingFeeRate / 100);
  const monthlyInsurance = annualInsurance / 12;
  const insuranceCost = monthlyInsurance * n;

  // TAE: the bank hands over the principal minus the fee and you pay back payment + insurance each month.
  const monthlyIrr = solveMonthlyIrr(principal - openingCost, monthlyPayment + monthlyInsurance, n);
  const apr = (Math.pow(1 + monthlyIrr, 12) - 1) * 100;

  return {
    monthlyPayment,
    totalPaid,
    totalInterest: totalPaid - principal,
    openingCost,
    insuranceCost,
    totalCostWithFees: totalPaid + openingCost + insuranceCost,
    apr,
    schedule,
  };
}
