// Header and whole-file validation of the Trade Republic export: what makes NOTHING importable
// (as opposed to a single invalid row, which is skipped with a reason).

import { firstItem, itemAt } from "../../arrays.js";
import { CsvSyntaxError, parseCsv, type CsvRecord } from "../csv.js";
import { MAX_IMPORT_ROWS } from "../limits.js";

/** Exact header of the export (23 columns). If it changes, we would rather fail than guess. */
export const TRADE_REPUBLIC_HEADER = [
  "datetime",
  "date",
  "account_type",
  "category",
  "type",
  "asset_class",
  "name",
  "symbol",
  "shares",
  "price",
  "amount",
  "fee",
  "tax",
  "currency",
  "original_amount",
  "original_currency",
  "fx_rate",
  "description",
  "transaction_id",
  "counterparty_name",
  "counterparty_iban",
  "payment_reference",
  "mcc_code",
] as const;

export type TradeRepublicColumn = (typeof TRADE_REPUBLIC_HEADER)[number];

export type TradeRepublicParseErrorCode =
  /** Empty or without any data row. */
  | "EMPTY_FILE"
  /** Not a well-formed CSV. */
  | "MALFORMED_CSV"
  /** The header is not the Trade Republic export's. */
  | "NOT_TRADE_REPUBLIC"
  | "TOO_MANY_ROWS";

/** The file cannot be imported at all (as opposed to a single invalid row). */
export class TradeRepublicParseError extends Error {
  constructor(
    readonly code: TradeRepublicParseErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "TradeRepublicParseError";
  }
}

/**
 * Parses the CSV, checks that it is the Trade Republic export and returns its data rows (without
 * the header).
 *
 * @throws {TradeRepublicParseError} if the file as a whole is unusable.
 */
export function readDataRecords(text: string): CsvRecord[] {
  let records: CsvRecord[];
  try {
    records = parseCsv(text);
  } catch (error) {
    if (error instanceof CsvSyntaxError) {
      throw new TradeRepublicParseError(
        "MALFORMED_CSV",
        `The file is not a valid CSV (line ${error.line}): ${error.message}`,
      );
    }
    throw error;
  }

  if (records.length === 0) {
    throw new TradeRepublicParseError("EMPTY_FILE", "The file is empty");
  }

  const header = firstItem(records);
  const dataRecords = records.slice(1);
  const isExpectedHeader =
    header.fields.length === TRADE_REPUBLIC_HEADER.length &&
    TRADE_REPUBLIC_HEADER.every((column, i) => itemAt(header.fields, i).trim() === column);
  if (!isExpectedHeader) {
    throw new TradeRepublicParseError(
      "NOT_TRADE_REPUBLIC",
      "The header does not match a Trade Republic transaction export",
    );
  }
  if (dataRecords.length === 0) {
    throw new TradeRepublicParseError("EMPTY_FILE", "The file has no transactions");
  }
  if (dataRecords.length > MAX_IMPORT_ROWS) {
    throw new TradeRepublicParseError("TOO_MANY_ROWS", `The file has more than ${MAX_IMPORT_ROWS} rows`);
  }
  return dataRecords;
}
