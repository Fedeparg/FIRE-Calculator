// Export rows already mapped by column name, field validators and the context shared by the
// resolvers of each row type.

import { itemAt } from "../../arrays.js";
import type { CsvRecord } from "../csv.js";
import { formatUnits, parseUnits } from "../decimal.js";
import type { ImportedAssetClass, ImportSkipReason, ImportSkippedRow } from "../types.js";
import { TRADE_REPUBLIC_HEADER, type TradeRepublicColumn } from "./header.js";

/** Scale of `position_lots.quantity/price/fees`: rounding happens here so as not to depend on the DB. */
export const AMOUNT_SCALE = 6;

export const ISIN = /^[A-Z0-9]{12}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?Z$/;

/** Row already mapped by column name: only the columns the parser needs. */
export type Row = {
  line: number;
  datetime: string;
  date: string;
  type: string;
  assetClass: string;
  name: string;
  symbol: string;
  shares: string;
  price: string;
  amount: string;
  fee: string;
  tax: string;
  currency: string;
  originalAmount: string;
  originalCurrency: string;
  transactionId: string;
};

/** Skips a row with its reason (it ends up in `skipped`, sorted by line at the end). */
export type SkipFn = (row: { line: number; type: string }, reason: ImportSkipReason) => void;

/**
 * State shared by the resolvers of a single file. `seenIds` detects `transaction_id`s repeated
 * ACROSS row types: the first one to claim it keeps the row and the rest skip it as
 * `duplicate_row`, so the order in which the resolvers are called matters (buys and sells, then
 * bonus issues, then payouts).
 */
export type ImportContext = {
  skip: SkipFn;
  seenIds: Set<string>;
};

/** Creates the context of a file and the list of skipped rows it fills. */
export function createImportContext(): { context: ImportContext; skipped: ImportSkippedRow[] } {
  const skipped: ImportSkippedRow[] = [];
  const skip: SkipFn = (row, reason) => {
    skipped.push({ line: row.line, type: row.type, reason });
  };
  return { context: { skip, seenIds: new Set<string>() }, skipped };
}

/**
 * Claims the `transaction_id` of a valid row, or skips it as a duplicate if already seen.
 * Returns whether the row goes ahead.
 */
export function claimTransactionId(row: Row, context: ImportContext): boolean {
  if (context.seenIds.has(row.transactionId)) {
    context.skip(row, "duplicate_row");
    return false;
  }
  context.seenIds.add(row.transactionId);
  return true;
}

/** Already validated data row: it has exactly the columns of `TRADE_REPUBLIC_HEADER`, in order. */
export function toRow(record: CsvRecord): Row {
  const get = (column: TradeRepublicColumn): string =>
    itemAt(record.fields, TRADE_REPUBLIC_HEADER.indexOf(column)).trim();
  return {
    line: record.line,
    datetime: get("datetime"),
    date: get("date"),
    type: get("type"),
    assetClass: get("asset_class"),
    name: get("name"),
    symbol: get("symbol"),
    shares: get("shares"),
    price: get("price"),
    amount: get("amount"),
    fee: get("fee"),
    tax: get("tax"),
    currency: get("currency"),
    originalAmount: get("original_amount"),
    originalCurrency: get("original_currency"),
    transactionId: get("transaction_id"),
  };
}

/** `executedAt` normalized to 6 decimal places of seconds, or `null` if it is not a valid instant. */
export function normalizeDatetime(raw: string): string | null {
  const match = DATETIME.exec(raw);
  if (!match) return null;
  const [, base, fraction = ""] = match;
  // The date group is mandatory in `DATETIME`: if there is a `match`, there is a `base`.
  if (base === undefined) return null;
  const normalized = `${base}.${fraction.padEnd(6, "0").slice(0, 6)}Z`;
  const parsed = new Date(normalized);
  // `Date` accepts 31 February by rolling it over: check that the round trip matches.
  if (Number.isNaN(parsed.getTime()) || !parsed.toISOString().startsWith(base)) return null;
  return normalized;
}

export function isValidDate(raw: string): boolean {
  if (!DATE.test(raw)) return false;
  const parsed = new Date(`${raw}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(raw);
}

export function assetClassOf(raw: string): ImportedAssetClass {
  switch (raw) {
    case "FUND":
      return "fund";
    case "STOCK":
      return "stock";
    case "DERIVATIVE":
      return "derivative";
    default:
      return "other";
  }
}

/** Amount at the DB scale, or `null` if it is not a plain decimal. */
export function amountUnits(raw: string): bigint | null {
  return parseUnits(raw, AMOUNT_SCALE);
}

/** Fixed-point integer at the DB scale → decimal without trailing zeros. */
export function formatAmount(units: bigint): string {
  return formatUnits(units, AMOUNT_SCALE);
}

/** Already rounded number → decimal at the DB scale. */
export function decimalOf(value: number): string {
  return formatAmount(amountUnits(value.toFixed(AMOUNT_SCALE)) ?? 0n);
}
