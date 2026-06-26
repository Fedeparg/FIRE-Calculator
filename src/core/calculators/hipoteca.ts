// Hipoteca a tipo fijo. Sistema de amortización francés (cuota constante).
// Además de la cuota y los intereses, estima la TAE incluyendo la comisión de
// apertura y los seguros vinculados, que es la cifra honesta para comparar
// ofertas entre bancos. Core puro.

export interface MortgageInput {
  /** Capital prestado. */
  principal: number;
  /** TIN anual, en base 100 (3 = 3 %). */
  annualRate: number;
  /** Plazo en años. */
  years: number;
  /** Comisión de apertura como % del capital. Opcional (por defecto 0). */
  openingFeeRate?: number;
  /**
   * Coste anual de los productos vinculados (seguro de hogar, vida…) exigidos
   * para obtener el tipo. Se incluye en la TAE. Opcional (por defecto 0).
   */
  annualInsurance?: number;
}

export interface MortgageYearPoint {
  year: number;
  /** Capital amortizado durante el año. */
  principalPaid: number;
  /** Intereses pagados durante el año. */
  interestPaid: number;
  /** Capital pendiente al final del año. */
  balance: number;
}

export interface MortgageResult {
  /** Cuota mensual (solo capital + intereses). */
  monthlyPayment: number;
  /** Total pagado en cuotas a lo largo de la vida del préstamo. */
  totalPaid: number;
  /** Total de intereses pagados. */
  totalInterest: number;
  /** Comisión de apertura (importe). */
  openingCost: number;
  /** Coste total de los seguros vinculados durante toda la vida del préstamo. */
  insuranceCost: number;
  /** Coste total real: cuotas + comisión de apertura + seguros. */
  totalCostWithFees: number;
  /**
   * TAE estimada, en base 100. Tiene en cuenta la comisión de apertura y los
   * seguros vinculados. Con comisión y seguros a 0 equivale a la capitalización
   * mensual del TIN: (1 + TIN/12)^12 − 1, ligeramente por encima del TIN.
   */
  apr: number;
  schedule: MortgageYearPoint[];
}

/**
 * Resuelve el tipo mensual `r` que iguala el importe neto recibido con el valor
 * actual de los pagos mensuales (cuota + seguro). Bisección: la función es
 * monótona decreciente en `r`, así que converge con seguridad.
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
  let hi = 1; // 100 % mensual: cota superior holgadísima.
  // npv(lo) ≥ 0 y npv(hi) < 0 → raíz en (lo, hi).
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

  const monthlyPayment =
    i === 0 ? principal / n : (principal * i) / (1 - Math.pow(1 + i, -n));

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

  // TAE: el banco te entrega el capital menos la comisión de apertura, y tú
  // devuelves cada mes la cuota más el seguro vinculado.
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
