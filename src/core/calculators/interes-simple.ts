// Interés simple: el interés se calcula siempre sobre el capital inicial (no se
// reinvierte). Modelo típico de un depósito a plazo fijo español, con retención
// fiscal (rendimiento del capital mobiliario). Core puro.

import type { ProjectionPoint } from "../projection";

export interface SimpleInterestInput {
  /** Capital inicial. */
  principal: number;
  /** Tipo de interés anual (TIN), en base 100 (5 = 5 %). */
  annualRate: number;
  /** Plazo en años. */
  years: number;
  /**
   * Retención/impuesto sobre los intereses, en base 100. Los intereses de un
   * depósito son rendimiento del capital mobiliario: por defecto 19 % (España).
   */
  withholdingRate?: number;
}

// Misma forma que el motor genérico → compatible con TimeSeriesChart.
export type SimpleInterestPoint = ProjectionPoint;

export interface SimpleInterestResult {
  /** Valor final bruto (capital + intereses brutos). */
  finalValue: number;
  /** Intereses brutos generados. */
  totalInterest: number;
  /** Importe retenido sobre los intereses. */
  withheld: number;
  /** Intereses netos (tras retención). */
  netInterest: number;
  /** Valor final neto (capital + intereses netos). */
  netFinalValue: number;
  series: SimpleInterestPoint[];
}

export function computeSimpleInterest(input: SimpleInterestInput): SimpleInterestResult {
  const principal = Math.max(0, input.principal || 0);
  const rate = (input.annualRate || 0) / 100;
  const years = Math.max(0, Math.round(input.years || 0));
  const withholding = Math.min(100, Math.max(0, input.withholdingRate ?? 19)) / 100;

  const series: SimpleInterestPoint[] = [];
  for (let year = 0; year <= years; year++) {
    const interest = principal * rate * year;
    const value = principal + interest;
    series.push({ year, contributed: principal, interest, value, realValue: value });
  }

  const totalInterest = principal * rate * years;
  const withheld = Math.max(0, totalInterest) * withholding;
  const netInterest = totalInterest - withheld;

  return {
    finalValue: principal + totalInterest,
    totalInterest,
    withheld,
    netInterest,
    netFinalValue: principal + netInterest,
    series,
  };
}
