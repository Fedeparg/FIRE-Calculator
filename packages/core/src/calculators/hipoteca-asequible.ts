// ¿Qué hipoteca me puedo permitir? Combina la regla del esfuerzo, el LTV máximo del banco y el
// ahorro, que debe cubrir entrada y gastos de compra. Core puro.

import { monthlyRate, presentValueOfPayments } from "./amortization.js";
import { computeMortgage } from "./hipoteca.js";
import { clampYears } from "../inputs.js";

export interface AffordabilityInput {
  netMonthlyIncome: number;
  monthlyDebts: number;
  downPayment: number;
  /** TIN anual de la hipoteca, en base 100 (3 = 3 %). */
  annualRate: number;
  termYears: number;
  /** Ratio de esfuerzo máximo, en base 100. Por defecto 35 % (criterio del BdE). */
  effortRatio?: number;
  /** Porcentaje máximo del precio que financia el banco. Por defecto 80 %. */
  maxLtv?: number;
  /** Gastos de compra (ITP/IVA, notaría…) como % del precio. Por defecto 12 %. */
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

  // 1) Préstamo máximo por capacidad de pago (regla del esfuerzo).
  const maxMonthlyPayment = Math.max(0, income * effort - debts);
  const maxLoanByPayment = presentValueOfPayments(maxMonthlyPayment, i, n);

  // 2) Precio máximo: mayor P con efectivo(P) = P·(1 + gastos) − préstamo(P) ≤ ahorro, siendo
  //    préstamo(P) = min(maxLoanByPayment, ltv·P); efectivo es monótono creciente.
  const effLow = 1 + costsRate - ltv; // pendiente del efectivo mientras manda el LTV
  const breakpoint = ltv > 0 ? maxLoanByPayment / ltv : Number.POSITIVE_INFINITY;
  const cashAtBreakpoint = Number.isFinite(breakpoint) ? breakpoint * effLow : Number.POSITIVE_INFINITY;

  let maxPrice: number;
  let binding: AffordabilityBinding;
  if (savings <= cashAtBreakpoint) {
    // manda el LTV + ahorro
    maxPrice = effLow > 0 ? savings / effLow : breakpoint;
    binding = "savings";
  } else {
    // manda la capacidad de pago
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
