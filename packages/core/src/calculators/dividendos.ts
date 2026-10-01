// Dividendos: ingreso anual, retención española y proyección con crecimiento. Core puro.

import { clampYears } from "../inputs.js";

export interface DividendInput {
  shares: number;
  dividendPerShare: number;
  sharePrice?: number;
  withholdingRate?: number;
  annualGrowth?: number;
  /** Años de proyección; por defecto 0 (solo año 1). */
  years?: number;
}

export interface DividendYearPoint {
  [key: string]: number;
  year: number;
  grossAnnual: number;
  netAnnual: number;
  cumulativeNet: number;
}

export interface DividendResult {
  gross: number;
  withheld: number;
  net: number;
  grossYield: number | null;
  netYield: number | null;
  cumulativeNet: number;
  finalYearNet: number;
  /** Año 0 = punto base, sin dividendo cobrado todavía. */
  series: DividendYearPoint[];
}

export function computeDividends(input: DividendInput): DividendResult {
  const shares = Math.max(0, input.shares || 0);
  const dividendPerShare = Math.max(0, input.dividendPerShare || 0);
  const withholding = Math.min(100, Math.max(0, input.withholdingRate ?? 19)) / 100;
  const growth = Math.max(0, input.annualGrowth || 0) / 100;
  const years = clampYears(input.years);

  const gross = shares * dividendPerShare;
  const withheld = gross * withholding;
  const net = gross - withheld;

  const invested = shares * Math.max(0, input.sharePrice || 0);
  const grossYield = invested > 0 ? (gross / invested) * 100 : null;
  const netYield = invested > 0 ? (net / invested) * 100 : null;

  const series: DividendYearPoint[] = [{ year: 0, grossAnnual: 0, netAnnual: 0, cumulativeNet: 0 }];
  let cumulativeNet = 0;
  let finalYearNet = net;
  for (let year = 1; year <= years; year++) {
    const factor = Math.pow(1 + growth, year - 1);
    const grossAnnual = gross * factor;
    const netAnnual = net * factor;
    cumulativeNet += netAnnual;
    finalYearNet = netAnnual;
    series.push({ year, grossAnnual, netAnnual, cumulativeNet });
  }

  return {
    gross,
    withheld,
    net,
    grossYield,
    netYield,
    cumulativeNet,
    finalYearNet,
    series,
  };
}
