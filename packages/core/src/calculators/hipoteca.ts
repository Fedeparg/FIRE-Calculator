// Hipoteca a tipo fijo (amortización francesa). Además de cuota e intereses estima la TAE con
// comisión de apertura y seguros vinculados, la cifra honesta para comparar ofertas. Core puro.

export interface MortgageInput {
  principal: number;
  annualRate: number;
  years: number;
  openingFeeRate?: number;
  /** Coste anual de los productos vinculados exigidos para el tipo; entra en la TAE. */
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
  /** TAE estimada, en base 100, con comisión y seguros. Sin ellos equivale a (1 + TIN/12)^12 − 1. */
  apr: number;
  schedule: MortgageYearPoint[];
}

/** Tipo mensual `r` que iguala el neto recibido con el valor actual de los pagos (bisección sobre una función monótona decreciente). */
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
  let hi = 1; // 100 % mensual: cota superior holgada
  for (let iter = 0; iter < 100; iter++) {
    const mid = (lo + hi) / 2;
    if (npv(mid) > 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export function computeMortgage(input: MortgageInput): MortgageResult {
  const principal = Math.max(0, input.principal || 0);
  const years = Math.max(1, Math.round(input.years || 1));
  const n = years * 12;
  const i = (input.annualRate || 0) / 100 / 12;
  const openingFeeRate = Math.max(0, input.openingFeeRate || 0);
  const annualInsurance = Math.max(0, input.annualInsurance || 0);

  const monthlyPayment = i === 0 ? principal / n : (principal * i) / (1 - Math.pow(1 + i, -n));

  const schedule: MortgageYearPoint[] = [];
  let balance = principal;
  let yearPrincipal = 0;
  let yearInterest = 0;

  for (let month = 1; month <= n; month++) {
    const interest = balance * i;
    const principalPart = monthlyPayment - interest;
    balance = Math.max(0, balance - principalPart);
    yearPrincipal += principalPart;
    yearInterest += interest;

    if (month % 12 === 0 || month === n) {
      schedule.push({
        year: Math.ceil(month / 12),
        principalPaid: yearPrincipal,
        interestPaid: yearInterest,
        balance,
      });
      yearPrincipal = 0;
      yearInterest = 0;
    }
  }

  const totalPaid = monthlyPayment * n;
  const openingCost = principal * (openingFeeRate / 100);
  const monthlyInsurance = annualInsurance / 12;
  const insuranceCost = monthlyInsurance * n;

  // TAE: el banco entrega el capital menos la comisión y tú devuelves cuota + seguro cada mes.
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
