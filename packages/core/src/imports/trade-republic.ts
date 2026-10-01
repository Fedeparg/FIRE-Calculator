// Parser de la "Exportación de transacciones" (CSV) de Trade Republic. Lógica PURA: recibe el
// texto y devuelve operaciones normalizadas, filas descartadas con su motivo y avisos.
//
// PRIVACIDAD: el export trae columnas con datos de terceros (contraparte, IBAN, referencia de
// pago, MCC) y un texto libre por fila (`description`). Aquí NO se leen: se accede a las
// columnas por nombre y solo a las que hacen falta, así que esos datos mueren con el array
// `fields` de cada registro y no llegan a ningún resultado, log ni mensaje de error.

import { CsvSyntaxError, parseCsv, type CsvRecord } from "./csv.js";
import { MAX_IMPORT_ROWS } from "./limits.js";
import type {
  ImportedAssetClass,
  ImportedTrade,
  ImportParseResult,
  ImportSkippedRow,
  ImportSkipReason,
  ImportWarning,
} from "./types.js";

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

/** Escala de `position_lots.quantity/price/fees`: se redondea aquí para no depender de la BD. */
const AMOUNT_SCALE = 6;
/** Escala con la que se comparan cantidades de migraciones (el export trae hasta 10). */
const MIGRATION_SCALE = 10;

const ISIN = /^[A-Z0-9]{12}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?Z$/;
const PLAIN_DECIMAL = /^(-)?(\d+)(?:\.(\d+))?$/;

/** Tipos que son solo movimientos de efectivo o de renta, sin efecto en las posiciones. */
function skipReasonForType(type: string): ImportSkipReason {
  switch (type) {
    case "DIVIDEND":
      return "dividend";
    case "INTEREST_PAYMENT":
      return "interest";
    case "BENEFITS_SAVEBACK":
    case "STOCKPERK":
      return "benefit";
    case "IPO_SUBSCRIPTION":
      return "ipo_subscription";
    case "CUSTOMER_INBOUND":
      return "cash_movement";
    default:
      return type.startsWith("CARD_") || type.startsWith("TRANSFER_")
        ? "cash_movement"
        : "unknown_type";
  }
}

/**
 * Decimal plano → entero de coma fija con `scale` decimales (half-up sobre el valor absoluto).
 * Devuelve `null` si no es un decimal plano (nada de exponentes, miles ni espacios).
 */
function parseUnits(raw: string, scale: number): bigint | null {
  const match = PLAIN_DECIMAL.exec(raw);
  if (!match) return null;
  const [, sign, intPart, fracPart = ""] = match;
  const padded = fracPart.padEnd(scale + 1, "0");
  let units = BigInt(intPart + padded.slice(0, scale));
  if (padded.charCodeAt(scale) - 48 >= 5) units += 1n;
  return sign ? -units : units;
}

/** Inverso de `parseUnits`, sin ceros decimales sobrantes ("1.50" → "1.5", "2.000" → "2"). */
function formatUnits(units: bigint, scale: number): string {
  const negative = units < 0n;
  const digits = (negative ? -units : units).toString().padStart(scale + 1, "0");
  const intPart = digits.slice(0, digits.length - scale);
  const fracPart = digits.slice(digits.length - scale).replace(/0+$/, "");
  return `${negative ? "-" : ""}${intPart}${fracPart ? `.${fracPart}` : ""}`;
}

/** `executedAt` normalizado a 6 decimales de segundo, o `null` si no es un instante válido. */
function normalizeDatetime(raw: string): string | null {
  const match = DATETIME.exec(raw);
  if (!match) return null;
  const [, base, fraction = ""] = match;
  const normalized = `${base}.${fraction.padEnd(6, "0").slice(0, 6)}Z`;
  const parsed = new Date(normalized);
  // `Date` acepta 31 de febrero reajustándolo: se comprueba que el viaje de ida y vuelta coincide.
  if (Number.isNaN(parsed.getTime()) || !parsed.toISOString().startsWith(base)) return null;
  return normalized;
}

function isValidDate(raw: string): boolean {
  if (!DATE.test(raw)) return false;
  const parsed = new Date(`${raw}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(raw);
}

function assetClassOf(raw: string): ImportedAssetClass {
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

/** Fila ya mapeada por nombre de columna: solo las columnas que el parser necesita. */
type Row = {
  line: number;
  datetime: string;
  date: string;
  type: string;
  assetClass: string;
  name: string;
  symbol: string;
  shares: string;
  price: string;
  fee: string;
  tax: string;
  currency: string;
  transactionId: string;
};

function toRow(record: CsvRecord, index: Record<string, number>): Row {
  const get = (column: (typeof TRADE_REPUBLIC_HEADER)[number]): string =>
    record.fields[index[column]].trim();
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
    fee: get("fee"),
    tax: get("tax"),
    currency: get("currency"),
    transactionId: get("transaction_id"),
  };
}

/**
 * Parsea el export de transacciones de Trade Republic.
 *
 * Reglas (verificadas contra un export real):
 * - Se importan `BUY` y `SELL`. El importe bruto es `cantidad × precio`; la columna `amount`
 *   no se usa (hay una compra antigua con `amount` y `fee` vacíos que sigue siendo válida).
 * - `fee` es coste de la operación y se guarda en valor absoluto. `tax` NO se suma al coste
 *   (se cree que son retenciones de dividendos que TR liquida en la fila de la compra): solo
 *   se avisa de cuántas operaciones la traen.
 * - `date` manda sobre `datetime` como fecha de operación: puede diferir del día UTC.
 * - Las `MIGRATION` (cambio de custodia) vienen en parejas salida/entrada con el mismo ISIN y
 *   cantidad, a pocos milisegundos entre sí, y efecto neto cero: se ignoran las parejas y se avisa de las sueltas.
 * - El resto de tipos, los cripto y las divisas distintas de EUR se descartan con motivo; un
 *   tipo desconocido nunca hace fallar la importación.
 *
 * @throws {TradeRepublicParseError} si el fichero entero no es utilizable.
 */
export function parseTradeRepublicCsv(text: string): ImportParseResult {
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

  const [header, ...dataRecords] = records;
  const isExpectedHeader =
    header.fields.length === TRADE_REPUBLIC_HEADER.length &&
    TRADE_REPUBLIC_HEADER.every((column, i) => header.fields[i].trim() === column);
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
    throw new TradeRepublicParseError(
      "TOO_MANY_ROWS",
      `The file has more than ${MAX_IMPORT_ROWS} rows`,
    );
  }

  const index = Object.fromEntries(TRADE_REPUBLIC_HEADER.map((column, i) => [column, i]));
  const skipped: ImportSkippedRow[] = [];
  const skip = (row: { line: number; type: string }, reason: ImportSkipReason): void => {
    skipped.push({ line: row.line, type: row.type, reason });
  };

  const parsed: { trade: ImportedTrade; line: number }[] = [];
  const migrations: Row[] = [];
  const seenIds = new Set<string>();
  let tradesWithTax = 0;

  for (const record of dataRecords) {
    if (record.fields.length !== TRADE_REPUBLIC_HEADER.length) {
      skipped.push({ line: record.line, type: "", reason: "invalid_row" });
      continue;
    }
    const row = toRow(record, index);

    if (row.type === "MIGRATION") {
      migrations.push(row);
      continue;
    }
    if (row.type !== "BUY" && row.type !== "SELL") {
      skip(row, skipReasonForType(row.type));
      continue;
    }

    if (/crypto/i.test(row.assetClass)) {
      skip(row, "crypto");
      continue;
    }
    if (row.currency !== "EUR") {
      skip(row, "unsupported_currency");
      continue;
    }

    const shares = parseUnits(row.shares, AMOUNT_SCALE);
    const price = parseUnits(row.price, AMOUNT_SCALE);
    const fee = row.fee === "" ? 0n : parseUnits(row.fee, AMOUNT_SCALE);
    const tax = row.tax === "" ? 0n : parseUnits(row.tax, AMOUNT_SCALE);
    const executedAt = normalizeDatetime(row.datetime);
    // BUY lleva cantidad positiva y SELL negativa; cualquier otra cosa es una fila corrupta.
    const signMatches =
      shares !== null && (row.type === "BUY" ? shares > 0n : shares < 0n);

    if (
      !ISIN.test(row.symbol) ||
      !isValidDate(row.date) ||
      executedAt === null ||
      row.transactionId === "" ||
      !signMatches ||
      price === null ||
      price < 0n ||
      fee === null ||
      tax === null
    ) {
      skip(row, "invalid_row");
      continue;
    }
    if (seenIds.has(row.transactionId)) {
      skip(row, "duplicate_row");
      continue;
    }
    seenIds.add(row.transactionId);

    if (tax !== 0n) tradesWithTax++;
    const trade: ImportedTrade = {
      externalId: row.transactionId,
      isin: row.symbol,
      name: row.name,
      assetClass: assetClassOf(row.assetClass),
      kind: row.type === "BUY" ? "buy" : "sell",
      quantity: formatUnits(shares < 0n ? -shares : shares, AMOUNT_SCALE),
      price: formatUnits(price, AMOUNT_SCALE),
      fees: formatUnits(fee < 0n ? -fee : fee, AMOUNT_SCALE),
      tradedAt: row.date,
      executedAt,
    };
    parsed.push({ trade, line: row.line });
  }

  const warnings: ImportWarning[] = [];
  warnings.push(...resolveMigrations(migrations, skip));
  if (tradesWithTax > 0) {
    warnings.push({ code: "trade_tax_ignored", count: tradesWithTax });
  }

  // Estable: ante el mismo instante, el orden del fichero.
  parsed.sort(
    (a, b) =>
      (a.trade.executedAt < b.trade.executedAt ? -1 : a.trade.executedAt > b.trade.executedAt ? 1 : 0) ||
      a.line - b.line,
  );
  const trades = parsed.map(({ trade }) => trade);
  skipped.sort((a, b) => a.line - b.line);

  return { trades, skipped, warnings };
}

/**
 * Ventana en la que una salida y una entrada de migración cuentan como la misma. En un export
 * real las dos filas de una pareja difieren en unos pocos milisegundos (3-6 ms), no coinciden
 * al instante exacto; un segundo cubre ese desfase sin confundir migraciones distintas.
 */
const MIGRATION_PAIR_WINDOW_MS = 1_000;

/**
 * Empareja migraciones (salida + entrada con mismo ISIN y cantidad, casi al mismo instante).
 * Las parejas se descartan como `migration_pair`; las filas sueltas como `migration_unbalanced`
 * y generan un aviso, porque pueden esconder historial que falta o sobra.
 */
function resolveMigrations(
  migrations: readonly Row[],
  skip: (row: { line: number; type: string }, reason: ImportSkipReason) => void,
): ImportWarning[] {
  type Leg = { row: Row; ms: number };
  const groups = new Map<string, { outgoing: Leg[]; incoming: Leg[] }>();
  const warnings: ImportWarning[] = [];

  for (const row of migrations) {
    const shares = parseUnits(row.shares, MIGRATION_SCALE);
    const executedAt = normalizeDatetime(row.datetime);
    if (!ISIN.test(row.symbol) || !isValidDate(row.date) || executedAt === null || shares === null || shares === 0n) {
      skip(row, "invalid_row");
      continue;
    }
    // `Date` solo llega al milisegundo: se recortan los microsegundos antes de parsear.
    const ms = new Date(`${executedAt.slice(0, 23)}Z`).getTime();
    const key = `${row.symbol}|${formatUnits(shares < 0n ? -shares : shares, MIGRATION_SCALE)}`;
    const group = groups.get(key) ?? { outgoing: [], incoming: [] };
    (shares < 0n ? group.outgoing : group.incoming).push({ row, ms });
    groups.set(key, group);
  }

  for (const { outgoing, incoming } of groups.values()) {
    const unmatched = [...incoming].sort((a, b) => a.ms - b.ms || a.row.line - b.row.line);
    const loose: Leg[] = [];
    for (const out of [...outgoing].sort((a, b) => a.ms - b.ms || a.row.line - b.row.line)) {
      const at = unmatched.findIndex((leg) => Math.abs(leg.ms - out.ms) <= MIGRATION_PAIR_WINDOW_MS);
      if (at === -1) {
        loose.push(out);
        continue;
      }
      skip(out.row, "migration_pair");
      skip(unmatched.splice(at, 1)[0].row, "migration_pair");
    }
    for (const { row } of [...loose, ...unmatched]) {
      skip(row, "migration_unbalanced");
      warnings.push({ code: "unbalanced_migration", isin: row.symbol, line: row.line });
    }
  }
  return warnings;
}
