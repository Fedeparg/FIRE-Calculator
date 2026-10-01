// Interés simple (sobre el capital inicial, sin reinvertir), como un depósito español con retención. Core puro.

import type { ProjectionPoint } from "../projection.js";
import { clampYears } from "../inputs.js";

export interface SimpleInterestInput {
  principal: number;
  annualRate: number;
  years: number;
  /** Retención sobre los intereses, en base 100; por defecto 19 % (capital mobiliario). */
  withholdingRate?: number;
}

// misma forma que el motor genérico: compatible con TimeSeriesChart
export type SimpleInterestPoint = ProjectionPoint;

export interface SimpleInterestResult {
  finalValue: number;
  totalInterest: number;
  withheld: number;
  netInterest: number;
  netFinalValue: number;
  series: SimpleInterestPoint[];
}

export function computeSimpleInterest(input: SimpleInterestInput): SimpleInterestResult {
  const principal = Math.max(0, input.principal || 0);
  const rate = (input.annualRate || 0) / 100;
  const years = clampYears(input.years);
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
