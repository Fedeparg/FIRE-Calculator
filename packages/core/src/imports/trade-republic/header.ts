// Cabecera y validación del fichero entero del export de Trade Republic: lo que hace que no se
// pueda importar NADA (distinto de una fila concreta inválida, que se descarta con motivo).

import { firstItem, itemAt } from "../../arrays.js";
import { CsvSyntaxError, parseCsv, type CsvRecord } from "../csv.js";
import { MAX_IMPORT_ROWS } from "../limits.js";

/** Cabecera exacta del export (23 columnas). Si cambia, preferimos fallar a adivinar. */
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
  /** Vacío o sin ninguna fila de datos. */
  | "EMPTY_FILE"
  /** No es un CSV bien formado. */
  | "MALFORMED_CSV"
  /** La cabecera no es la del export de Trade Republic. */
  | "NOT_TRADE_REPUBLIC"
  | "TOO_MANY_ROWS";

/** El fichero no se puede importar en absoluto (distinto de una fila concreta inválida). */
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
 * Parsea el CSV, comprueba que es el export de Trade Republic y devuelve sus filas de datos (sin
 * la cabecera).
 *
 * @throws {TradeRepublicParseError} si el fichero entero no es utilizable.
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
