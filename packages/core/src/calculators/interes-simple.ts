// Simple interest (on the initial principal, not reinvested), like a Spanish deposit with withholding. Pure core.

import type { ProjectionPoint } from "../projection.js";
import { clampYears } from "../inputs.js";
import { SPAIN_SAVINGS_WITHHOLDING_PCT } from "../fiscal/countries.js";

export interface SimpleInterestInput {
  principal: number;
  annualRate: number;
  years: number;
  /** Withholding on interest, in base 100; defaults to 19% (investment income, capital mobiliario). */
  withholdingRate?: number;
}

// same shape as the generic engine: compatible with TimeSeriesChart
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
  const withholding = Math.min(100, Math.max(0, input.withholdingRate ?? SPAIN_SAVINGS_WITHHOLDING_PCT)) / 100;

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
