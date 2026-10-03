// Inflation (IPC, the Spanish CPI): erosion of purchasing power at an average annual rate. Pure core.
// Compares idle money with money invested at a nominal return, to show why you need to beat inflation.

import { clampYears } from "../inputs.js";

export interface InflationInput {
  amount: number;
  annualRate: number;
  years: number;
  /** Nominal annual return the money is invested at, in base 100; 0 = idle. */
  nominalReturn?: number;
}

export interface InflationPoint {
  year: number;
  nominalNeeded: number;
  /** Purchasing power of the idle amount. */
  realValue: number;
  /** Purchasing power of the amount invested at `nominalReturn`. */
  realValueInvested: number;
}

export interface InflationResult {
  nominalNeeded: number;
  realValue: number;
  realValueInvested: number;
  lossPercent: number;
  realReturn: number;
  series: InflationPoint[];
}

export function computeInflation(input: InflationInput): InflationResult {
  const amount = Math.max(0, input.amount || 0);
  const rate = (input.annualRate || 0) / 100;
  const ret = (input.nominalReturn || 0) / 100;
  const years = clampYears(input.years);

  const series: InflationPoint[] = [];
  for (let year = 0; year <= years; year++) {
    const inflationFactor = Math.pow(1 + rate, year);
    const investFactor = Math.pow(1 + ret, year);
    series.push({
      year,
      nominalNeeded: amount * inflationFactor,
      realValue: inflationFactor !== 0 ? amount / inflationFactor : amount,
      realValueInvested: inflationFactor !== 0 ? (amount * investFactor) / inflationFactor : amount * investFactor,
    });
  }

  const finalFactor = Math.pow(1 + rate, years);
  const realValue = finalFactor !== 0 ? amount / finalFactor : amount;
  const realValueInvested = finalFactor !== 0 ? (amount * Math.pow(1 + ret, years)) / finalFactor : amount;

  // Annualized real return (exact Fisher equation): (1+r)/(1+i) − 1. With inflation ≤ −100%
  // the factor drops to zero and, as in `realValue`, no adjustment is made: the nominal remains.
  const realReturn = 1 + rate > 0 ? ((1 + ret) / (1 + rate) - 1) * 100 : ret * 100;

  return {
    nominalNeeded: amount * finalFactor,
    realValue,
    realValueInvested,
    lossPercent: amount > 0 ? ((amount - realValue) / amount) * 100 : 0,
    realReturn,
    series,
  };
}
