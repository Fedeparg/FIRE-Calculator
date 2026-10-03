// Shared tax core: official scales and the progressive-bracket engine. Pure core module.
// Scope and assumptions: see ./README.md. Indicative figures for tax year `FISCAL_YEAR`.

import { lastItem } from "../arrays.js";
import { nonNegative } from "../inputs.js";

/** Reference tax year for the scales in this module. */
export const FISCAL_YEAR = 2026;

/** `FISCAL_YEAR` as a string: keeps locale number formatting from rendering it as "2.026". */
export const FISCAL_YEAR_LABEL = String(FISCAL_YEAR);

/**
 * Date (`YYYY-MM-DD`) from which the `FISCAL_YEAR` figures must be reviewed: scales, minimums,
 * Social Security and `withholding-rates.ts`. It matches the start of the Renta (tax return)
 * campaign. A test fails from that day on: it is an executable reminder, not an expiry of the
 * calculation. When reviewing, update `FISCAL_YEAR` and this date.
 */
export const FISCAL_REVIEW_BY = "2027-04-01";

/** A scale bracket: `upTo` is the inclusive upper limit (`null` = last); `rate` in % (19 = 19%). */
export interface Bracket {
  readonly upTo: number | null;
  readonly rate: number;
}

/** Tax on a base under a progressive scale: each bracket taxes only its slice of the base. */
export function applyProgressiveBrackets(base: number, brackets: readonly Bracket[]): number {
  const b = nonNegative(base);
  let tax = 0;
  let lower = 0;

  for (const bracket of brackets) {
    const upper = bracket.upTo ?? Infinity;
    if (b <= lower) break;
    const taxable = Math.min(b, upper) - lower;
    if (taxable > 0) tax += taxable * (bracket.rate / 100);
    lower = upper;
  }

  return tax;
}

/** Marginal rate (%) applicable to the last euro of the given base. */
export function marginalRate(base: number, brackets: readonly Bracket[]): number {
  const b = nonNegative(base);
  for (const bracket of brackets) {
    if (b <= (bracket.upTo ?? Infinity)) return bracket.rate;
  }
  return brackets.length > 0 ? lastItem(brackets).rate : 0;
}

export function effectiveRate(base: number, brackets: readonly Bracket[]): number {
  const b = nonNegative(base);
  if (b === 0) return 0;
  return (applyProgressiveBrackets(b, brackets) / b) * 100;
}

/**
 * IRPF — state scale for the general taxable base (base liquidable general, art. 63.1.1º LIRPF).
 * Applied as is, with no 0.5 factor: the law already gives it halved. Source: AEAT, Manual
 * práctico de Renta 2025.
 */
export const IRPF_STATE_SCALE: readonly Bracket[] = [
  { upTo: 12450, rate: 9.5 },
  { upTo: 20200, rate: 12 },
  { upTo: 35200, rate: 15 },
  { upTo: 60000, rate: 18.5 },
  { upTo: 300000, rate: 22.5 },
  { upTo: null, rate: 24.5 },
];

/**
 * IRPF — default regional scale (escala autonómica supletoria, art. 65 LIRPF). It is not
 * identical to the state scale: its last bracket is a flat 22.50% from €60,000, without the
 * 24.50% from €300,000 (mixing them up would give 49% instead of 47%). It applies to Ceuta and
 * Melilla (DA 32ª LIRPF) and non-residents, and it is the one used with no region (see
 * `regions.ts`).
 */
export const IRPF_DEFAULT_REGIONAL_SCALE: readonly Bracket[] = [
  { upTo: 12450, rate: 9.5 },
  { upTo: 20200, rate: 12 },
  { upTo: 35200, rate: 15 },
  { upTo: 60000, rate: 18.5 },
  { upTo: null, rate: 22.5 },
];

/**
 * IRPF — general scale: bracket-by-bracket sum of the state and default regional scales (47% =
 * 24.50 + 22.50). Applied with no region; each region has its own. Source: AEAT 2026.
 */
export const IRPF_GENERAL_SCALE: readonly Bracket[] = [
  { upTo: 12450, rate: 19 },
  { upTo: 20200, rate: 24 },
  { upTo: 35200, rate: 30 },
  { upTo: 60000, rate: 37 },
  { upTo: 300000, rate: 45 },
  { upTo: null, rate: 47 },
];

/** IRPF — savings scale (interest, dividends, capital gains). Source: AEAT 2026. */
export const IRPF_SAVINGS_SCALE: readonly Bracket[] = [
  { upTo: 6000, rate: 19 },
  { upTo: 50000, rate: 21 },
  { upTo: 200000, rate: 23 },
  { upTo: 300000, rate: 27 },
  { upTo: null, rate: 30 },
];

/** Wealth Tax (Impuesto sobre el Patrimonio) — state scale (fallback for the regions). Ley 19/1991, art. 30. */
export const WEALTH_TAX_STATE_SCALE: readonly Bracket[] = [
  { upTo: 167129.45, rate: 0.2 },
  { upTo: 334252.88, rate: 0.3 },
  { upTo: 668499.75, rate: 0.5 },
  { upTo: 1336999.51, rate: 0.9 },
  { upTo: 2673999.01, rate: 1.3 },
  { upTo: 5347998.03, rate: 1.7 },
  { upTo: 10695996.06, rate: 2.1 },
  { upTo: null, rate: 3.5 },
];

/** Wealth Tax — state exempt minimum (Ley 19/1991, art. 28); several regions set a different one. */
export const WEALTH_TAX_EXEMPT_MINIMUM = 700000;

/** Wealth Tax — primary-residence exemption, up to this amount (Ley 19/1991, art. 4.Nueve). */
export const WEALTH_TAX_PRIMARY_RESIDENCE_EXEMPTION = 300000;

/** Inheritance and Gift Tax (Sucesiones y Donaciones) — state rate table (regional fallback). Ley 29/1987, art. 21. */
export const GIFT_TAX_STATE_SCALE: readonly Bracket[] = [
  { upTo: 7993.46, rate: 7.65 },
  { upTo: 15980.91, rate: 8.5 },
  { upTo: 23968.36, rate: 9.35 },
  { upTo: 31955.81, rate: 10.2 },
  { upTo: 39943.26, rate: 11.05 },
  { upTo: 47930.72, rate: 11.9 },
  { upTo: 55918.17, rate: 12.75 },
  { upTo: 63905.62, rate: 13.6 },
  { upTo: 71893.07, rate: 14.45 },
  { upTo: 79880.52, rate: 15.3 },
  { upTo: 119757.67, rate: 16.15 },
  { upTo: 159634.83, rate: 18.7 },
  { upTo: 239389.13, rate: 21.25 },
  { upTo: 398777.54, rate: 25.5 },
  { upTo: 797555.08, rate: 29.75 },
  { upTo: null, rate: 34 },
];

/**
 * Employee Social Security (SS) contribution (permanent contract), in %: common contingencies
 * 4.70 + unemployment 1.55 + vocational training (FP) 0.10 + MEI 0.15. Source: Orden de
 * cotización 2026.
 */
export const SS_EMPLOYEE_RATE = 6.5;

/** Employee contribution on a temporary contract (unemployment 1.60% instead of 1.55%). */
export const SS_EMPLOYEE_RATE_TEMPORAL = 6.55;

/** Maximum Social Security contribution base: €5,101.20/month × 12. Source: 2026. */
export const SS_MAX_BASE_ANNUAL = 61214.4;

/** Other deductible expenses from employment income (art. 19.2.f LIRPF). */
export const WORK_OTHER_EXPENSES = 2000;

/** Taxpayer's personal minimum (general, under 65). Art. 57 LIRPF. */
export const PERSONAL_MINIMUM = 5550;

export const PERSONAL_MINIMUM_65 = 6700;

export const PERSONAL_MINIMUM_75 = 8100;

/**
 * Minimum for descendants (art. 58 LIRPF) by child order (1st, 2nd, 3rd, 4th and
 * subsequent). The taxpayer is assumed to claim 100% (if shared, half).
 */
export const DESCENDANT_MINIMUMS = [2400, 2700, 4000, 4500] as const;

/** Minimum increase for each descendant under 3. */
export const DESCENDANT_UNDER_3_MINIMUM = 2800;

export const ASCENDANT_MINIMUM = 1150;

export const DISABILITY_MINIMUM_33 = 3000;
export const DISABILITY_MINIMUM_65 = 9000;

/**
 * Inheritance and Gift Tax — pre-existing wealth thresholds (€) of the four tiers of the
 * multiplier coefficient (Ley 29/1987, art. 22.2); the upper limit belongs to its tier.
 */
export const GIFT_TAX_WEALTH_TIERS = [402678.11, 2007380.43, 4020770.98] as const;

/**
 * Inheritance and Gift Tax — multiplier coefficient by kinship group and pre-existing wealth tier
 * (Ley 29/1987, art. 22.2). Groups I and II: spouse, descendants and ascendants; III: 2nd- and
 * 3rd-degree collateral relatives and in-laws; IV: everyone else.
 */
export const GIFT_TAX_KINSHIP_COEFFICIENTS = {
  grupoI_II: [1.0, 1.05, 1.1, 1.2],
  grupoIII: [1.5882, 1.6676, 1.7471, 1.9059],
  grupoIV: [2.0, 2.1, 2.2, 2.4],
} as const;

/** Base reduction for joint taxation (tributación conjunta, two-parent family unit). */
export const JOINT_RETURN_REDUCTION = 3400;

/** Annual limit on individual pension-plan contributions that reduce the base. Art. 52 LIRPF. */
export const PENSION_INDIVIDUAL_LIMIT = 1500;

/** Limit increase for employer contributions to occupational pension plans (art. 52.1 LIRPF). */
export const PENSION_EMPLOYER_LIMIT = 8500;

/** Joint limit (individual + employer) that reduces the base (art. 52.1 LIRPF); also capped at 30% of net income. */
export const PENSION_JOINT_LIMIT = 10000;

/** Cap on pension-plan contributions: 30% of net employment and business income (art. 52.1 LIRPF). */
export const PENSION_NET_INCOME_CAP_RATE = 30;

/**
 * Simplified direct assessment (estimación directa simplificada) — hard-to-justify expenses
 * (gastos de difícil justificación): 5% of the prior positive net income (art. 30 RIRPF,
 * RD 439/2007). The 7% was a one-off for 2023.
 */
export const SELF_EMPLOYED_DIFFICULT_EXPENSES_RATE = 5;

/** Annual cap on hard-to-justify expenses (simplified direct assessment). */
export const SELF_EMPLOYED_DIFFICULT_EXPENSES_CAP = 2000;

/**
 * Employment income reduction (art. 20 LIRPF), decreasing over three tiers: the maximum up to
 * `FULL_LIMIT`; up to `TIER2_LIMIT`, maximum − `TIER2_SLOPE` × excess; up to `TIER3_LIMIT`,
 * `TIER3_BASE` − `TIER3_SLOPE` × excess; above that, 0. Source: AEAT.
 */
export const WORK_INCOME_REDUCTION_FULL_LIMIT = 14852;
export const WORK_INCOME_REDUCTION_MAX = 7302;
export const WORK_INCOME_REDUCTION_TIER2_LIMIT = 17673.52;
export const WORK_INCOME_REDUCTION_TIER2_SLOPE = 1.75;
export const WORK_INCOME_REDUCTION_TIER3_LIMIT = 19747.5;
export const WORK_INCOME_REDUCTION_TIER3_BASE = 2364.34;
export const WORK_INCOME_REDUCTION_TIER3_SLOPE = 1.14;
