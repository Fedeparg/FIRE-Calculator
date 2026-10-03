// Portfolio form validation: from the typed text to the numbers sent to the API.
// Pure (no React): shared by the components and tested in node. The rules are the same ones
// the API applies (it is the one that decides); here they only enable the button and warn.

import { withholdingsFitGross } from "@sextante/core/fiscal/income";
import { parseDecimalInput } from "@/shared/format/number-input";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const COUNTRY_CODE = /^[A-Z]{2}$/;

/** Typed number, or `NaN` if it is not one yet ("", "-", "abc"). */
function decimalOrNaN(raw: string): number {
  return parseDecimalInput(raw) ?? Number.NaN;
}

/** Optional field: empty means `empty`; otherwise the typed number (or `NaN`). */
function optionalDecimal<T extends number | null>(raw: string, empty: T): number | T {
  return raw.trim() === "" ? empty : decimalOrNaN(raw);
}

const isPositive = (value: number) => Number.isFinite(value) && value > 0;
const isNonNegative = (value: number) => Number.isFinite(value) && value >= 0;

/** Quantity and average price of a position. `null` if the symbol is missing or a number is invalid. */
export function validatePositionForm(values: {
  ticker: string;
  quantity: string;
  avgPrice: string;
}): { quantity: number; avgPrice: number } | null {
  const quantity = decimalOrNaN(values.quantity);
  const avgPrice = decimalOrNaN(values.avgPrice);
  if (values.ticker.trim() === "" || !isPositive(quantity) || !isNonNegative(avgPrice)) return null;
  return { quantity, avgPrice };
}

/** Amounts of a lot (empty fees are 0). `null` if any is invalid or the date is missing. */
export function validateLotForm(values: {
  quantity: string;
  price: string;
  fees: string;
  tradedAt: string;
}): { quantity: number; price: number; fees: number } | null {
  const quantity = decimalOrNaN(values.quantity);
  const price = decimalOrNaN(values.price);
  const fees = optionalDecimal(values.fees, 0);
  const valid = isPositive(quantity) && isNonNegative(price) && isNonNegative(fees) && ISO_DAY.test(values.tradedAt);
  return valid ? { quantity, price, fees } : null;
}

/** What is sent for an income entry after validating the text fields. */
export type IncomeFormNumbers = {
  gross: number;
  /** `null` = unknown withholding at source (not the same as 0). */
  withholdingOrigin: number | null;
  withholdingSpain: number;
  /** Two-letter upper-case ISO code, or `null` if not given. */
  country: string | null;
};

/**
 * Validates an income entry. `incomplete`: something still needs to be typed correctly (no
 * warning). `inconsistent`: the gross amount and the withholdings are valid numbers but the whole
 * does not add up (withholdings above the gross, bad country or date): we warn, because the user
 * believes they are done.
 */
export function validateIncomeForm(values: {
  gross: string;
  origin: string;
  spain: string;
  country: string;
  paidAt: string;
}): { ok: true; value: IncomeFormNumbers } | { ok: false; reason: "incomplete" | "inconsistent" } {
  const gross = decimalOrNaN(values.gross);
  const origin = optionalDecimal(values.origin, null);
  const spain = optionalDecimal(values.spain, 0);
  const country = values.country.trim().toUpperCase();

  const withholdingsValid = (origin === null || isNonNegative(origin)) && isNonNegative(spain);
  const valid =
    isPositive(gross) &&
    withholdingsValid &&
    withholdingsFitGross(gross, origin, spain) &&
    (country === "" || COUNTRY_CODE.test(country)) &&
    ISO_DAY.test(values.paidAt);
  if (valid) {
    return {
      ok: true,
      value: { gross, withholdingOrigin: origin, withholdingSpain: spain, country: country || null },
    };
  }
  const typed = values.gross.trim() !== "" && Number.isFinite(gross) && withholdingsValid;
  return { ok: false, reason: typed ? "inconsistent" : "incomplete" };
}

/**
 * Pending balances from previous tax years: each amount > 0, with no repeated year and type.
 * Returns the amounts in the same order, or `null` if any is invalid; `duplicated` is reported
 * separately because it has its own warning.
 */
export function validatePendingBalances<K extends string>(
  rows: readonly { originYear: number; kind: K; amount: string }[],
): { duplicated: boolean; amounts: number[] | null } {
  const duplicated = new Set(rows.map((row) => `${row.originYear}:${row.kind}`)).size !== rows.length;
  const amounts = rows.map((row) => decimalOrNaN(row.amount));
  return { duplicated, amounts: !duplicated && amounts.every(isPositive) ? amounts : null };
}
