// A tax year's complete savings base (base del ahorro): gains and losses from sales, capital
// income (rendimientos del capital mobiliario), offsetting (art. 49 LIRPF), tax, foreign tax
// credit (deducción por doble imposición internacional, art. 80 LIRPF) and Spanish withholding.
// Pure core module: it joins `realised-gains.ts`, `income.ts`, `savings-base.ts`, `savings-tax.ts`
// and `double-taxation.ts`. See ./README.md.

import { firstItem, lastItem } from "../arrays.js";
import { computeDoubleTaxationDeduction, type DoubleTaxationResult } from "./double-taxation.js";
import { referenceRateOn, toEur, type ReferenceRates } from "./fx-reference.js";
import type { IncomeEvent, IncomeYear } from "./income.js";
import type { RealisedGainsYear } from "./realised-gains.js";
import { computeSavingsBase, type PendingNegative, type SavingsBaseResult } from "./savings-base.js";
import { savingsTax, type SavingsTax } from "./savings-tax.js";

export interface SavingsReturnInput {
  year: number;
  /** The tax year's sales (`buildRealisedGainsReport`), or `undefined` if there were none. */
  gains: RealisedGainsYear | undefined;
  /** The tax year's income payments, summarised (`buildIncomeReport`), or `undefined` if there were none. */
  income: IncomeYear | undefined;
  /** The tax year's income payments, for country-by-country double taxation. */
  incomeEvents: readonly IncomeEvent[];
  rates: ReferenceRates;
  /** Negative balances from earlier tax years pending offset. */
  pending: readonly PendingNegative[];
}

export interface SavingsReturn {
  year: number;
  /** Balance of gains and losses from transfers (sales + FX differences). */
  gainsBalance: number;
  /** Net capital income (gross amounts; no deductible expenses recorded). */
  capitalIncomeBalance: number;
  savingsBase: SavingsBaseResult;
  /** Savings gross tax liability (cuota íntegra) and average rate. */
  tax: SavingsTax;
  doubleTaxation: DoubleTaxationResult;
  /** Tax after the foreign tax credit. */
  netTax: number;
  /** Spanish withholding on the income payments: subtracted later, in the final tax due (cuota diferencial). */
  withholdingSpain: number;
  /** What the savings base contributes to the return's result: tax − withholdings. */
  result: number;
  /**
   * The figure is incomplete: there are sales or income payments without an exchange rate, or
   * foreign dividends with no known withholding at source.
   */
  incomplete: boolean;
}

/** Computes the tax year's savings base end to end. */
export function buildSavingsReturn(input: SavingsReturnInput): SavingsReturn {
  const { gains, income } = input;
  const gainsBalance = gains?.total ?? 0;
  const capitalIncomeBalance = income ? income.interest.total.gross + income.dividend.total.gross : 0;

  const savingsBase = computeSavingsBase({
    year: input.year,
    gainsBalance,
    capitalIncomeBalance,
    pending: input.pending,
  });
  const tax = savingsTax(savingsBase.base);

  // Income taxed abroad (art. 80.1.b), payment by payment and in euros. Whatever paid nothing
  // abroad (interest on TR's German account) is left out: it would inflate the average-rate limit.
  // With unknown withholding it is included, so the double taxation module warns that it is missing.
  const foreign = input.incomeEvents.flatMap((event) => {
    if (!event.country || event.country === "ES" || event.withholdingOrigin === 0) return [];
    const rate = referenceRateOn(input.rates, event.currency, event.paidAt);
    if (!rate) return [];
    return [
      {
        country: event.country,
        gross: toEur(event.gross, rate),
        withholdingOrigin: event.withholdingOrigin === null ? null : toEur(event.withholdingOrigin, rate),
      },
    ];
  });
  const doubleTaxation = computeDoubleTaxationDeduction(foreign, tax.averageRatePct);
  const netTax = Math.max(0, tax.tax - doubleTaxation.deduction);
  const withholdingSpain = income ? income.interest.total.withholdingSpain + income.dividend.total.withholdingSpain : 0;

  return {
    year: input.year,
    gainsBalance,
    capitalIncomeBalance,
    savingsBase,
    tax,
    doubleTaxation,
    netTax,
    withholdingSpain,
    result: netTax - withholdingSpain,
    incomplete:
      (gains?.unconverted.length ?? 0) > 0 || (income?.unconverted.length ?? 0) > 0 || (income?.originUnknown ?? 0) > 0,
  };
}

export interface SavingsReturnsInput {
  gains: readonly RealisedGainsYear[];
  income: readonly IncomeYear[];
  incomeEvents: readonly IncomeEvent[];
  rates: ReferenceRates;
  /**
   * Negative balances pending at the start of the first tax year Sextante computes, from years it
   * does not compute (the user copies them from their last return).
   */
  manualPending: readonly PendingNegative[];
}

/**
 * The savings base of every tax year with data, in order, carrying the pending negative balances
 * forward from one to the next (art. 49 LIRPF: four years). Intermediate years with no data are
 * walked too, so balances expire when they should. Returns the tax years with sales or income
 * payments, from newest to oldest.
 */
export function buildSavingsReturns(input: SavingsReturnsInput): SavingsReturn[] {
  const gainsByYear = new Map(input.gains.map((y) => [y.year, y]));
  const incomeByYear = new Map(input.income.map((y) => [y.year, y]));
  const years = [...new Set([...gainsByYear.keys(), ...incomeByYear.keys()])].sort((a, b) => a - b);
  if (years.length === 0) return [];

  const out: SavingsReturn[] = [];
  let carried: PendingNegative[] = [...input.manualPending];
  for (let year = firstItem(years); year <= lastItem(years); year++) {
    const result = buildSavingsReturn({
      year,
      gains: gainsByYear.get(year),
      income: incomeByYear.get(year),
      incomeEvents: input.incomeEvents.filter((event) => event.paidAt.startsWith(String(year))),
      rates: input.rates,
      pending: carried,
    });
    carried = [...result.savingsBase.pending];
    if (gainsByYear.has(year) || incomeByYear.has(year)) out.push(result);
  }
  return out.reverse();
}
