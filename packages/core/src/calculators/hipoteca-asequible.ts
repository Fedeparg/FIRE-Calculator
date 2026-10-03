// How much mortgage can I afford? Combines the debt-to-income (effort) rule, the bank's maximum LTV
// and savings, which must cover the down payment and purchase costs. Pure core.

import { monthlyRate, presentValueOfPayments } from "./amortization.js";
import { computeMortgage } from "./hipoteca.js";
import { clampYears } from "../inputs.js";

export interface AffordabilityInput {
  netMonthlyIncome: number;
  monthlyDebts: number;
  downPayment: number;
  /** Annual mortgage TIN (nominal rate), in base 100 (3 = 3%). */
  annualRate: number;
  termYears: number;
  /** Maximum debt-to-income (effort) ratio, in base 100. Defaults to 35% (Banco de España guideline). */
  effortRatio?: number;
  /** Maximum percentage of the price the bank finances. Defaults to 80%. */
  maxLtv?: number;
  /** Purchase costs (ITP/VAT, notary…) as a % of the price. Defaults to 12%. */
  purchaseCostsRate?: number;
}

export type AffordabilityBinding = "income" | "savings";

export interface AffordabilityResult {
  maxMonthlyPayment: number;
  maxLoan: number;
  maxPrice: number;
  estimatedMonthlyPayment: number;
  downPaymentNeeded: number;
  purchaseCostsAmount: number;
  binding: AffordabilityBinding;
}

export function computeAffordability(input: AffordabilityInput): AffordabilityResult {
  const income = Math.max(0, input.netMonthlyIncome || 0);
  const debts = Math.max(0, input.monthlyDebts || 0);
  const savings = Math.max(0, input.downPayment || 0);
  const effort = Math.min(100, Math.max(0, input.effortRatio ?? 35)) / 100;
  const ltv = Math.min(100, Math.max(0, input.maxLtv ?? 80)) / 100;
  const costsRate = Math.max(0, input.purchaseCostsRate ?? 12) / 100;
  const i = monthlyRate(input.annualRate);
  const term = clampYears(input.termYears, 1);
  const n = term * 12;

  // 1) Maximum loan from repayment capacity (effort rule).
  const maxMonthlyPayment = Math.max(0, income * effort - debts);
  const maxLoanByPayment = presentValueOfPayments(maxMonthlyPayment, i, n);

  // 2) Maximum price: the largest P with cash(P) = P·(1 + costs) − loan(P) ≤ savings, where
  //    loan(P) = min(maxLoanByPayment, ltv·P); cash is monotonically increasing.
  const effLow = 1 + costsRate - ltv; // slope of cash while the LTV is the binding limit
  const breakpoint = ltv > 0 ? maxLoanByPayment / ltv : Number.POSITIVE_INFINITY;
  const cashAtBreakpoint = Number.isFinite(breakpoint) ? breakpoint * effLow : Number.POSITIVE_INFINITY;

  let maxPrice: number;
  let binding: AffordabilityBinding;
  if (savings <= cashAtBreakpoint) {
    // LTV + savings is the binding limit
    maxPrice = effLow > 0 ? savings / effLow : breakpoint;
    binding = "savings";
  } else {
    // repayment capacity is the binding limit
    maxPrice = (savings + maxLoanByPayment) / (1 + costsRate);
    binding = "income";
  }
  maxPrice = Math.max(0, maxPrice);

  const maxLoan = Math.min(maxLoanByPayment, ltv * maxPrice);
  const estimatedMonthlyPayment = computeMortgage({
    principal: maxLoan,
    annualRate: input.annualRate,
    years: term,
  }).monthlyPayment;

  return {
    maxMonthlyPayment,
    maxLoan,
    maxPrice,
    estimatedMonthlyPayment,
    downPaymentNeeded: maxPrice - maxLoan,
    purchaseCostsAmount: maxPrice * costsRate,
    binding,
  };
}
