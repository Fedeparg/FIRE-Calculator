// ROI with costs, income received, annualized ROI (CAGR) and net after tax. Pure core.

import { SPAIN_SAVINGS_WITHHOLDING_PCT } from "../fiscal/countries.js";

export interface RoiInput {
  initial: number;
  final: number;
  years?: number;
  costs?: number;
  income?: number;
  /** Tax on the gain, in base 100. Defaults to 19% (savings base, base del ahorro). */
  taxRate?: number;
}

export interface RoiResult {
  invested: number;
  gain: number;
  roi: number;
  annualized: number | null;
  tax: number;
  netGain: number;
  netRoi: number;
}

export function computeRoi(input: RoiInput): RoiResult {
  const initial = input.initial || 0;
  const final = input.final || 0;
  const costs = Math.max(0, input.costs || 0);
  const income = input.income || 0;
  const taxRate = Math.min(100, Math.max(0, input.taxRate ?? SPAIN_SAVINGS_WITHHOLDING_PCT)) / 100;

  const invested = initial + costs;
  const gain = final + income - invested;
  const roi = invested !== 0 ? (gain / invested) * 100 : 0;

  let annualized: number | null = null;
  if (input.years && input.years > 0 && invested > 0 && final + income > 0) {
    const rate = (Math.pow((final + income) / invested, 1 / input.years) - 1) * 100;
    // A tiny term (1e-300 years) overflows the power: no answer, as if there were no term.
    annualized = Number.isFinite(rate) ? rate : null;
  }

  // Tax only applies to a positive gain.
  const tax = gain > 0 ? gain * taxRate : 0;
  const netGain = gain - tax;
  const netRoi = invested !== 0 ? (netGain / invested) * 100 : 0;

  return { invested, gain, roi, annualized, tax, netGain, netRoi };
}
