// Inflación (IPC): erosión del poder adquisitivo con una tasa media anual. Core puro. Compara el
// dinero parado con el invertido a una rentabilidad nominal, para ver por qué hay que batir a la inflación.

import { clampYears } from "../inputs.js";

export interface InflationInput {
  amount: number;
  annualRate: number;
  years: number;
  /** Rentabilidad nominal anual a la que se coloca el dinero, en base 100; 0 = parado. */
  nominalReturn?: number;
}

export interface InflationPoint {
  // firma de índice numérica: consumible como dato genérico de gráfica
  [key: string]: number;
  year: number;
  nominalNeeded: number;
  /** Poder adquisitivo del importe parado. */
  realValue: number;
  /** Poder adquisitivo del importe invertido a `nominalReturn`. */
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

  // Rentabilidad real anualizada (efecto Fisher exacto): (1+r)/(1+i) − 1. Con una inflación
  // ≤ −100 % el factor se anula y, como en `realValue`, no se ajusta: queda la nominal.
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
