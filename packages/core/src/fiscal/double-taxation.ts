// Foreign tax credit (deducción por doble imposición internacional, art. 80 LIRPF) on savings
// income. Pure core module: warnings are codes, not text. Scope and sources: see ./README.md.

import { nonNegative } from "../inputs.js";
import { countryColumn } from "./countries.js";

/**
 * Maximum rate (%) the double taxation treaty allows the source country on dividends paid to a
 * Spanish resident. View of `COUNTRY_DIVIDEND_RATES` (countries.ts), where the figure and its
 * sources live; an absent country has no confirmed figure.
 */
export const TREATY_DIVIDEND_RATES: Readonly<Record<string, number>> = countryColumn((rates) => rates.treatyPct);

/**
 * Countries with no treaty with Spain: the art. 80 LIRPF credit has no treaty limit and covers all
 * the tax paid (up to the average rate limit). Denmark, no treaty since 01/01/2009 (AEAT, folleto
 * "Residentes con rentas en Dinamarca"); Cayman Islands, no treaty.
 */
export const NO_TREATY_COUNTRIES: ReadonlySet<string> = new Set(["DK", "KY"]);

/** Gross foreign income from one country (ISO 3166-1 alpha-2), in euros. */
export interface ForeignIncome {
  readonly country: string;
  readonly gross: number;
  /** Withholding borne at source, in euros; `null` if unknown. */
  readonly withholdingOrigin: number | null;
}

export type DoubleTaxationWarningCode = "origin_unknown" | "no_treaty_rate" | "excess_withholding";

export interface DoubleTaxationWarning {
  readonly code: DoubleTaxationWarningCode;
  readonly country: string;
  /** `no_treaty_rate`: withholding not deducted; `excess_withholding`: reclaimable excess; `origin_unknown`: gross with no known withholding. */
  readonly amount: number;
}

export interface CountryDeduction {
  readonly country: string;
  readonly gross: number;
  /** Sum of the known withholdings. */
  readonly withholdingOrigin: number;
  /** Gross whose withholding is unknown (deducts nothing). */
  readonly unknownGross: number;
  readonly treatyRatePct: number | null;
  /** Creditable tax: min(withholding, treaty rate × gross). */
  readonly creditable: number;
  /** Withholding above the treaty rate, reclaimable from the source country's tax authority. */
  readonly excessReclaimable: number;
  /** Limit b) of art. 80.1 for this country: average effective rate × its gross. */
  readonly limit: number;
  /** The country's credit: min(creditable, limit). */
  readonly deduction: number;
}

export interface DoubleTaxationResult {
  readonly countries: readonly CountryDeduction[];
  readonly creditableTotal: number;
  /** Average effective rate applied, in % and with two decimals (art. 80.2 LIRPF). */
  readonly averageRatePct: number;
  /** Sum of each country's art. 80.1 limit b). */
  readonly limit: number;
  /** Total credit: sum of each country's. */
  readonly deduction: number;
  /** The average rate caps some country's creditable amount. */
  readonly limitedByAverageRate: boolean;
  readonly warnings: readonly DoubleTaxationWarning[];
}

interface Acc {
  gross: number;
  withholding: number;
  unknownGross: number;
  creditable: number;
  excess: number;
  noTreatyWithholding: number;
}

/**
 * Foreign tax credit (art. 80.1 LIRPF): the lower of a) the tax paid abroad and b) the average
 * effective rate × the income taxed abroad.
 *
 * Prudence decision: credit a) is capped at the treaty rate (the rest must be reclaimed at
 * source; it is not tax "actually due", «efectivamente debido»). Without a confirmed rate in
 * `TREATY_DIVIDEND_RATES` nothing is deducted and a warning is raised (`no_treaty_rate`); the
 * same with unknown withholding (`origin_unknown`).
 *
 * Limit b) is applied country by country and the credits are summed: art. 80.1.a) speaks of the
 * tax paid "on said income" («sobre dichos rendimientos»), income by income (so does the DGT,
 * V2393-25), and nothing allows offsetting a high-tax country's excess with another's headroom.
 * Aggregating everything would give the same or a larger credit; the per-country criterion is
 * the prudent one. See ./README.md.
 */
export function computeDoubleTaxationDeduction(
  incomes: readonly ForeignIncome[],
  averageRatePct: number | null,
): DoubleTaxationResult {
  const rate =
    averageRatePct !== null && Number.isFinite(averageRatePct)
      ? Math.max(0, Math.round(averageRatePct * 100) / 100)
      : 0;
  const byCountry = new Map<string, Acc>();

  for (const income of incomes) {
    const country = income.country.trim().toUpperCase();
    const acc = byCountry.get(country) ?? {
      gross: 0,
      withholding: 0,
      unknownGross: 0,
      creditable: 0,
      excess: 0,
      noTreatyWithholding: 0,
    };
    byCountry.set(country, acc);
    const gross = nonNegative(income.gross);
    acc.gross += gross;

    if (income.withholdingOrigin === null || !Number.isFinite(income.withholdingOrigin)) {
      acc.unknownGross += gross;
      continue;
    }
    const withholding = nonNegative(income.withholdingOrigin);
    acc.withholding += withholding;
    const rate = TREATY_DIVIDEND_RATES[country];
    if (rate === undefined) {
      if (NO_TREATY_COUNTRIES.has(country)) acc.creditable += withholding;
      else acc.noTreatyWithholding += withholding;
      continue;
    }
    const creditable = Math.min(withholding, (rate / 100) * gross);
    acc.creditable += creditable;
    acc.excess += withholding - creditable;
  }

  const countries: CountryDeduction[] = [];
  const warnings: DoubleTaxationWarning[] = [];
  for (const [country, acc] of [...byCountry.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const limit = (rate / 100) * acc.gross;
    countries.push({
      country,
      gross: acc.gross,
      withholdingOrigin: acc.withholding,
      unknownGross: acc.unknownGross,
      treatyRatePct: TREATY_DIVIDEND_RATES[country] ?? null,
      creditable: acc.creditable,
      excessReclaimable: acc.excess,
      limit,
      deduction: Math.min(acc.creditable, limit),
    });
    if (acc.unknownGross > 0) warnings.push({ code: "origin_unknown", country, amount: acc.unknownGross });
    if (acc.noTreatyWithholding > 0)
      warnings.push({ code: "no_treaty_rate", country, amount: acc.noTreatyWithholding });
    if (acc.excess > 0) warnings.push({ code: "excess_withholding", country, amount: acc.excess });
  }

  const creditableTotal = countries.reduce((s, c) => s + c.creditable, 0);
  return {
    countries,
    creditableTotal,
    averageRatePct: rate,
    limit: countries.reduce((s, c) => s + c.limit, 0),
    deduction: countries.reduce((s, c) => s + c.deduction, 0),
    limitedByAverageRate: countries.some((c) => c.limit < c.creditable),
    warnings,
  };
}
