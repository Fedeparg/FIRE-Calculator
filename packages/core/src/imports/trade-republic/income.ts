// Interest, rewards (saveback, stockperk) and dividends → payouts.

import { firstItem } from "../../arrays.js";
import { compareStrings } from "../../compare.js";
import { addDays } from "../../dates.js";
import { resolveFromBroker } from "../../fiscal/dividend-resolution.js";
import { absUnits } from "../decimal.js";
import type { ImportedIncome } from "../types.js";
import {
  amountUnits,
  claimTransactionId,
  decimalOf,
  formatAmount,
  ISIN,
  isValidDate,
  type ImportContext,
  type Row,
} from "./rows.js";
import type { TaxedBuy } from "./trades.js";

/** Row types that are payouts. */
export const INCOME_TYPES: ReadonlySet<string> = new Set([
  "INTEREST_PAYMENT",
  "BENEFITS_SAVEBACK",
  "STOCKPERK",
  "DIVIDEND",
]);

/**
 * Dividend reversals: TR sometimes pays a provisional dividend and then reverses it with the same
 * amount as a negative before paying the final one. Each reversal is paired with the earlier
 * payment with the same ISIN and amount, and both are skipped.
 */
function reversedDividends(rows: readonly Row[]): Set<Row> {
  const dropped = new Set<Row>();
  const dividends = rows.filter((row) => row.type === "DIVIDEND");
  for (const reversal of dividends) {
    const amount = amountUnits(reversal.amount);
    if (amount === null || amount >= 0n) continue;
    const original = dividends.findLast(
      (row) =>
        !dropped.has(row) &&
        row !== reversal &&
        row.symbol === reversal.symbol &&
        row.date <= reversal.date &&
        amountUnits(row.amount) === -amount,
    );
    if (original) {
      dropped.add(original);
      dropped.add(reversal);
    }
  }
  return dropped;
}

/**
 * Day of the custody change to TR's Spanish branch, or `null`. From the next day on, TR withholds
 * in Spain and reports to the AEAT (modelos 187, 189, 193, 196…): those payouts show up in the
 * draft return (borrador). It is detected through the `MIGRATION` rows (securities transfer
 * between the two entities); without them, through the first interest payment with Spanish
 * withholding (a Spanish account from the start).
 */
function spanishBranchCutoff(
  migrations: readonly Row[],
  incomeRows: readonly Row[],
): { date: string; inclusive: boolean } | null {
  const migrationDates = migrations.map((row) => row.date).filter(isValidDate);
  if (migrationDates.length > 0) return { date: migrationDates.sort().at(-1) as string, inclusive: false };
  const withheld = incomeRows
    .filter((row) => row.type === "INTEREST_PAYMENT" && isValidDate(row.date) && (amountUnits(row.tax) ?? 0n) !== 0n)
    .map((row) => row.date)
    .sort();
  return withheld.length > 0 ? { date: firstItem(withheld), inclusive: true } : null;
}

/** Dividend payout: the withholdings are split with `resolveFromBroker`. */
function dividendIncome(row: Row, amount: bigint, tax: bigint, isReported: boolean): ImportedIncome {
  const country = row.symbol.slice(0, 2);
  const shares = amountUnits(row.shares);
  const original = row.originalCurrency === "" ? null : amountUnits(row.originalAmount);
  const originalCurrency = original !== null && /^[A-Z]{3}$/.test(row.originalCurrency) ? row.originalCurrency : null;
  const split = resolveFromBroker({
    amount: Number(formatAmount(amount)),
    tax: Number(formatAmount(tax)),
    originalAmount: originalCurrency && original !== null ? Number(formatAmount(original)) : null,
    reported: isReported,
    country,
  });
  return {
    externalId: row.transactionId,
    kind: "dividend",
    paidAt: row.date,
    isin: row.symbol,
    name: row.name || null,
    country,
    currency: "EUR",
    gross: decimalOf(split.gross),
    withholdingOrigin: split.origin === null ? null : decimalOf(split.origin),
    withholdingSpain: decimalOf(split.spain),
    reportedToAeat: isReported,
    grossSource: split.grossSource,
    withholdingOriginSource: split.originSource,
    quantity: shares !== null && shares > 0n ? formatAmount(shares) : null,
    originalAmount: originalCurrency && original !== null ? formatAmount(original) : null,
    originalCurrency,
  };
}

/** Interest or reward payout, with the payer depending on the branch. */
function interestOrBenefitIncome(row: Row, amount: bigint, tax: bigint, isReported: boolean): ImportedIncome {
  // The Spanish branch reports each month's interest to the AEAT dated on its last day, even though
  // it pays it on the 1st of the next month: that way December's counts in its own year, as in the
  // draft return.
  const paidAt =
    row.type === "INTEREST_PAYMENT" && isReported && row.date.endsWith("-01") ? addDays(row.date, -1) : row.date;
  return {
    externalId: row.transactionId,
    kind: row.type === "INTEREST_PAYMENT" ? "interest" : "benefit",
    paidAt,
    isin: null,
    name: null,
    country: isReported ? "ES" : "DE",
    currency: "EUR",
    gross: formatAmount(amount),
    withholdingOrigin: "0",
    withholdingSpain: formatAmount(tax),
    reportedToAeat: isReported,
    grossSource: "broker",
    withholdingOriginSource: "broker",
    quantity: null,
    originalAmount: null,
    originalCurrency: null,
  };
}

/**
 * Interest and rewards (saveback, stockperk) → payouts. TR reports rewards as interest, with
 * their 19% withholding. Between July and November 2025 that withholding was not on the saveback
 * row but on the buy that invests it (same day and amount): it is taken from there (and consumed
 * from `taxedBuys`). Before the switch to the Spanish branch there is no withholding nor reporting
 * to the AEAT, and the payer is TR Germany (country `DE`); afterwards, Spain.
 */
export function resolveIncome(
  rows: readonly Row[],
  migrations: readonly Row[],
  taxedBuys: TaxedBuy[],
  context: ImportContext,
): { income: ImportedIncome[]; buysWithBenefitTax: number } {
  const cutoff = spanishBranchCutoff(migrations, rows);
  const reported = (date: string) => cutoff !== null && (cutoff.inclusive ? date >= cutoff.date : date > cutoff.date);
  const income: { item: ImportedIncome; line: number }[] = [];
  let buysWithBenefitTax = 0;
  const reversed = reversedDividends(rows);

  for (const row of rows) {
    if (reversed.has(row)) {
      context.skip(row, "dividend_reversed");
      continue;
    }
    const amount = amountUnits(row.amount);
    const ownTax = row.tax === "" ? 0n : amountUnits(row.tax);
    if (
      !isValidDate(row.date) ||
      row.transactionId === "" ||
      amount === null ||
      ownTax === null ||
      row.currency !== "EUR" ||
      (row.type === "DIVIDEND" && !ISIN.test(row.symbol))
    ) {
      context.skip(row, "invalid_row");
      continue;
    }
    if (!claimTransactionId(row, context)) continue;

    let tax = absUnits(ownTax);
    if (row.type !== "INTEREST_PAYMENT" && tax === 0n) {
      const at = taxedBuys.findIndex((buy) => buy.row.date === row.date && buy.amount === amount);
      if (at !== -1) {
        tax = absUnits(firstItem(taxedBuys.splice(at, 1)).tax);
        buysWithBenefitTax++;
      }
    }

    const isReported = reported(row.date);
    const item =
      row.type === "DIVIDEND"
        ? dividendIncome(row, amount, tax, isReported)
        : interestOrBenefitIncome(row, amount, tax, isReported);
    income.push({ item, line: row.line });
  }

  income.sort((a, b) => compareStrings(a.item.paidAt, b.item.paidAt) || a.line - b.line);
  return { income: income.map(({ item }) => item), buysWithBenefitTax };
}
