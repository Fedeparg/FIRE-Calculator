// Capital income (rendimientos del capital mobiliario) for the tax year (art. 25 LIRPF): dividends,
// interest and the rewards the broker reports as interest (saveback). Pure core module. Scope and
// sources: see ./README.md, section `income.ts`.

import { referenceRateOn, TAX_CURRENCY, toEur, type ReferenceRates } from "./fx-reference.js";

export const INCOME_KINDS = ["dividend", "interest", "benefit"] as const;
/**
 * `benefit`: a cash reward from the broker (saveback, stockperk). It is reported as interest
 * (the account-interest box), just as the broker itself does.
 */
export type IncomeKind = (typeof INCOME_KINDS)[number];

export const INCOME_SOURCES = ["manual", "trade_republic"] as const;
export type IncomeSource = (typeof INCOME_SOURCES)[number];

/**
 * Where a figure comes from: `broker` (as is in the broker's file), `derived` (arithmetic on
 * broker data), `market` (checked against the market dividend per share), `estimate` (the
 * country's statutory rate, unconfirmed) or `manual` (entered by the user).
 */
export const VALUE_SOURCES = ["broker", "derived", "market", "estimate", "manual"] as const;
export type ValueSource = (typeof VALUE_SOURCES)[number];

/** An income payment, as served by `GET /api/income`. Amounts in `currency`. */
export interface IncomeEvent {
  id: string;
  /** Position it comes from, if any (account interest has none). */
  positionId: string | null;
  kind: IncomeKind;
  /** Payment date (`YYYY-MM-DD`): it decides the tax year. */
  paidAt: string;
  isin: string | null;
  /** Security or account it comes from. */
  name: string | null;
  /** Source country (ISO 3166-1 alpha-2), for double taxation. */
  country: string | null;
  currency: string;
  /** Gross amount: before any withholding. Negative for a broker reversal. */
  gross: number;
  /** Withholding at source (retención en origen) in the source country; `null` if unknown. */
  withholdingOrigin: number | null;
  /** Withholding made in Spain (an IRPF payment on account). */
  withholdingSpain: number;
  /** The payer already reported it to the AEAT: it may appear in the draft return (borrador). */
  reportedToAeat: boolean;
  source: IncomeSource;
  grossSource: ValueSource;
  /** `null` while the withholding at source is unknown. */
  withholdingOriginSource: ValueSource | null;
  /** Shares entitled to the payment (imported dividends). */
  quantity: number | null;
  /** Amount paid in the payment currency, if it was not the euro. */
  originalAmount: number | null;
  originalCurrency: string | null;
  createdAt: string;
}

/** Creating or editing an income payment (`POST`/`PATCH /api/income`). */
export interface IncomePayload {
  kind: IncomeKind;
  paidAt: string;
  positionId?: string | null;
  isin?: string | null;
  name?: string | null;
  country?: string | null;
  currency?: string;
  gross: number;
  withholdingOrigin?: number | null;
  withholdingSpain?: number;
  reportedToAeat?: boolean;
}

/** Micro-units per unit: amounts are stored as `numeric(18,6)`, six decimals. */
const MICRO_UNITS = 1_000_000;

/**
 * Do the withholdings fit within the gross amount? Compared in INTEGER micro-units (the precision
 * they are stored with): in floating point, `0.1 + 0.2 <= 0.3` is `false` and a valid payment
 * would be rejected. A missing withholding counts as 0. Used by the API validation and the form.
 */
export function withholdingsFitGross(
  gross: number,
  withholdingOrigin: number | null | undefined,
  withholdingSpain: number | null | undefined,
): boolean {
  const micro = (value: number) => Math.round(value * MICRO_UNITS);
  return micro(withholdingOrigin ?? 0) + micro(withholdingSpain ?? 0) <= micro(gross);
}

/** Tax return grouping: interest (rewards included) or dividends. */
export type IncomeCategory = "interest" | "dividend";

export function incomeCategoryOf(kind: IncomeKind): IncomeCategory {
  return kind === "dividend" ? "dividend" : "interest";
}

/** Sums in euros of a set of income payments. */
export interface IncomeTotals {
  events: number;
  gross: number;
  withholdingOrigin: number;
  withholdingSpain: number;
  /** What was received: gross − withholdings. */
  net: number;
}

export interface IncomeCountryTotals extends IncomeTotals {
  country: string | null;
}

export interface IncomeCategoryReport {
  category: IncomeCategory;
  total: IncomeTotals;
  /** What the payer already reported to the AEAT: it may be in the draft return. */
  reported: IncomeTotals;
  /** What has to be added to the return by hand. */
  pending: IncomeTotals;
  /** By source country, highest gross first. */
  byCountry: IncomeCountryTotals[];
}

export interface IncomeYear {
  year: number;
  interest: IncomeCategoryReport;
  dividend: IncomeCategoryReport;
  /** Payments without an ECB rate on the payment date, by currency: left out of the totals. */
  unconverted: { currency: string; events: number }[];
  /** Foreign dividends with no known withholding at source (double taxation cannot be computed). */
  originUnknown: number;
  /** Foreign dividends whose withholding at source is an estimate (the country's statutory rate). */
  originEstimated: number;
}

export interface IncomeReport {
  /** Tax years with at least one payment, from newest to oldest. */
  years: IncomeYear[];
}

const emptyTotals = (): IncomeTotals => ({ events: 0, gross: 0, withholdingOrigin: 0, withholdingSpain: 0, net: 0 });

function add(totals: IncomeTotals, gross: number, origin: number, spain: number): void {
  totals.events += 1;
  totals.gross += gross;
  totals.withholdingOrigin += origin;
  totals.withholdingSpain += spain;
  totals.net += gross - origin - spain;
}

function emptyCategory(
  category: IncomeCategory,
): IncomeCategoryReport & { countries: Map<string, IncomeCountryTotals> } {
  return {
    category,
    total: emptyTotals(),
    reported: emptyTotals(),
    pending: emptyTotals(),
    byCountry: [],
    countries: new Map(),
  };
}

/** The payments' non-euro currencies and their oldest date, to request the ECB rates. */
export function incomeRatesNeeded(events: readonly IncomeEvent[]): { currencies: string[]; from: string } | null {
  const currencies = new Set<string>();
  let from: string | null = null;
  for (const event of events) {
    if (event.currency === TAX_CURRENCY) continue;
    currencies.add(event.currency);
    if (from === null || event.paidAt < from) from = event.paidAt;
  }
  return from === null ? null : { currencies: [...currencies].sort(), from };
}

/**
 * Per-tax-year summary of capital income, in euros. Foreign-currency payments are converted at
 * the ECB rate of the payment date; without a rate, they are left out of the totals.
 */
export function buildIncomeReport(events: readonly IncomeEvent[], rates: ReferenceRates): IncomeReport {
  const byYear = new Map<number, IncomeEvent[]>();
  for (const event of events) {
    const year = Number(event.paidAt.slice(0, 4));
    if (!Number.isInteger(year)) continue;
    const existing = byYear.get(year);
    if (existing) existing.push(event);
    else byYear.set(year, [event]);
  }
  const years = [...byYear.entries()].sort(([a], [b]) => b - a).map(([year, list]) => buildYear(year, list, rates));
  return { years };
}

function buildYear(year: number, events: readonly IncomeEvent[], rates: ReferenceRates): IncomeYear {
  const categories = { interest: emptyCategory("interest"), dividend: emptyCategory("dividend") };
  const unconverted = new Map<string, number>();
  let originUnknown = 0;
  let originEstimated = 0;

  for (const event of events) {
    const rate = referenceRateOn(rates, event.currency, event.paidAt);
    if (!rate) {
      unconverted.set(event.currency, (unconverted.get(event.currency) ?? 0) + 1);
      continue;
    }
    const gross = toEur(event.gross, rate);
    const origin = event.withholdingOrigin === null ? 0 : toEur(event.withholdingOrigin, rate);
    const spain = toEur(event.withholdingSpain, rate);
    if (event.kind === "dividend" && event.country !== "ES") {
      if (event.withholdingOrigin === null) originUnknown += 1;
      else if (event.withholdingOriginSource === "estimate") originEstimated += 1;
    }

    const category = categories[incomeCategoryOf(event.kind)];
    add(category.total, gross, origin, spain);
    add(event.reportedToAeat ? category.reported : category.pending, gross, origin, spain);
    const key = event.country ?? "";
    const country = category.countries.get(key) ?? { country: event.country, ...emptyTotals() };
    add(country, gross, origin, spain);
    category.countries.set(key, country);
  }

  const finish = ({ countries, ...category }: ReturnType<typeof emptyCategory>): IncomeCategoryReport => ({
    ...category,
    byCountry: [...countries.values()].sort((a, b) => b.gross - a.gross),
  });

  return {
    year,
    interest: finish(categories.interest),
    dividend: finish(categories.dividend),
    unconverted: [...unconverted.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([currency, count]) => ({ currency, events: count })),
    originUnknown,
    originEstimated,
  };
}
