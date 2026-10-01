// ¿Qué hipoteca me puedo permitir? Estima el importe máximo de préstamo y precio
// de vivienda combinando tres límites reales: la regla del esfuerzo (capacidad
// de pago), el porcentaje máximo que financia el banco (LTV) y el ahorro
// disponible, que debe cubrir la entrada Y los gastos de compra. Core puro.

import { computeMortgage } from "./hipoteca.js";

export interface AffordabilityInput {
  /** Ingresos mensuales netos del hogar. */
  netMonthlyIncome: number;
  /** Otras cuotas mensuales de deuda (préstamos, etc.). */
  monthlyDebts: number;
  /** Ahorro disponible para la entrada y los gastos. */
  downPayment: number;
  /** TIN anual de la hipoteca, en base 100 (3 = 3 %). */
  annualRate: number;
  /** Plazo de la hipoteca en años. */
  termYears: number;
  /** Ratio de esfuerzo máximo, en base 100. Por defecto 35 % (criterio del BdE). */
  effortRatio?: number;
  /** Porcentaje máximo del precio que financia el banco. Por defecto 80 %. */
  maxLtv?: number;
  /** Gastos de compra (ITP/IVA, notaría…) como % del precio. Por defecto 12 %. */
  purchaseCostsRate?: number;
}

/** Qué límite marca el tope: la capacidad de pago o el ahorro/LTV. */
export type AffordabilityBinding = "income" | "savings";

export interface AffordabilityResult {
  /** Cuota mensual máxima que permite la regla del esfuerzo. */
  maxMonthlyPayment: number;
  /** Importe máximo de préstamo. */
  maxLoan: number;
  /** Precio máximo de vivienda. */
  maxPrice: number;
  /** Cuota mensual estimada del préstamo resultante. */
  estimatedMonthlyPayment: number;
  /** Entrada necesaria (precio − préstamo). */
  downPaymentNeeded: number;
  /** Gastos de compra del precio máximo (importe). */
  purchaseCostsAmount: number;
  /** Límite que marca el tope: capacidad de pago ("income") o ahorro/LTV ("savings"). */
  binding: AffordabilityBinding;
}

export function computeAffordability(input: AffordabilityInput): AffordabilityResult {
  const income = Math.max(0, input.netMonthlyIncome || 0);
  const debts = Math.max(0, input.monthlyDebts || 0);
  const savings = Math.max(0, input.downPayment || 0);
  const effort = Math.min(100, Math.max(0, input.effortRatio ?? 35)) / 100;
  const ltv = Math.min(100, Math.max(0, input.maxLtv ?? 80)) / 100;
  const costsRate = Math.max(0, input.purchaseCostsRate ?? 12) / 100;
  const i = (input.annualRate || 0) / 100 / 12;
  const term = Math.max(1, Math.round(input.termYears || 1));
  const n = term * 12;

  // 1) Préstamo máximo por capacidad de pago (regla del esfuerzo).
  const maxMonthlyPayment = Math.max(0, income * effort - debts);
  const maxLoanByPayment =
    i === 0 ? maxMonthlyPayment * n : (maxMonthlyPayment * (1 - Math.pow(1 + i, -n))) / i;

  // 2) Precio máximo: el mayor P tal que el efectivo necesario ≤ ahorro, donde
  //    préstamo(P) = min(maxLoanByPayment, ltv·P) y
  //    efectivo(P) = P·(1 + gastos) − préstamo(P). Es monótono creciente en P.
  const effLow = 1 + costsRate - ltv; // pendiente del efectivo mientras manda el LTV
  const breakpoint = ltv > 0 ? maxLoanByPayment / ltv : Number.POSITIVE_INFINITY;
  const cashAtBreakpoint = Number.isFinite(breakpoint) ? breakpoint * effLow : Number.POSITIVE_INFINITY;

  let maxPrice: number;
  let binding: AffordabilityBinding;
  if (savings <= cashAtBreakpoint) {
    // Manda el LTV + el ahorro: el préstamo va al tope del LTV.
    maxPrice = effLow > 0 ? savings / effLow : breakpoint;
    binding = "savings";
  } else {
    // Manda la capacidad de pago: el préstamo va al tope de la cuota.
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
