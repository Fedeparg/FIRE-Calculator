// Filas del export ya mapeadas por nombre de columna, validadores de campo y el contexto que
// comparten los resolutores de cada tipo de fila.

import { itemAt } from "../../arrays.js";
import type { CsvRecord } from "../csv.js";
import { formatUnits, parseUnits } from "../decimal.js";
import type { ImportedAssetClass, ImportSkipReason, ImportSkippedRow } from "../types.js";
import { TRADE_REPUBLIC_HEADER, type TradeRepublicColumn } from "./header.js";

/** Escala de `position_lots.quantity/price/fees`: se redondea aquí para no depender de la BD. */
export const AMOUNT_SCALE = 6;

export const ISIN = /^[A-Z0-9]{12}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?Z$/;

/** Fila ya mapeada por nombre de columna: solo las columnas que el parser necesita. */
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

/** Descarta una fila con su motivo (queda en `skipped`, ordenado por línea al final). */
export type SkipFn = (row: { line: number; type: string }, reason: ImportSkipReason) => void;

/**
 * Estado compartido por los resolutores de un mismo fichero. `seenIds` detecta `transaction_id`
 * repetidos ENTRE tipos de fila: el primero que lo registra se queda la fila y los demás la
 * descartan como `duplicate_row`, así que el orden en que se llaman los resolutores importa
 * (compras y ventas, después ampliaciones liberadas, después cobros).
 */
export type ImportContext = {
  skip: SkipFn;
  seenIds: Set<string>;
};

/** Crea el contexto de un fichero y la lista de filas descartadas que va llenando. */
export function createImportContext(): { context: ImportContext; skipped: ImportSkippedRow[] } {
  const skipped: ImportSkippedRow[] = [];
  const skip: SkipFn = (row, reason) => {
    skipped.push({ line: row.line, type: row.type, reason });
  };
  return { context: { skip, seenIds: new Set<string>() }, skipped };
}

/**
 * Registra el `transaction_id` de una fila válida, o la descarta como duplicada si ya estaba.
 * Devuelve si la fila sigue adelante.
 */
export function claimTransactionId(row: Row, context: ImportContext): boolean {
  if (context.seenIds.has(row.transactionId)) {
    context.skip(row, "duplicate_row");
    return false;
  }
  context.seenIds.add(row.transactionId);
  return true;
}

/** Fila de datos ya validada: tiene exactamente las columnas de `TRADE_REPUBLIC_HEADER`, en su orden. */
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

/** `executedAt` normalizado a 6 decimales de segundo, o `null` si no es un instante válido. */
export function normalizeDatetime(raw: string): string | null {
  const match = DATETIME.exec(raw);
  if (!match) return null;
  const [, base, fraction = ""] = match;
  // El grupo de la fecha es obligatorio en `DATETIME`: si hay `match`, hay `base`.
  if (base === undefined) return null;
  const normalized = `${base}.${fraction.padEnd(6, "0").slice(0, 6)}Z`;
  const parsed = new Date(normalized);
  // `Date` acepta 31 de febrero reajustándolo: se comprueba que el viaje de ida y vuelta coincide.
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

/** Importe de la escala de la BD, o `null` si no es un decimal plano. */
export function amountUnits(raw: string): bigint | null {
  return parseUnits(raw, AMOUNT_SCALE);
}

/** Entero de coma fija de la escala de la BD → decimal sin ceros sobrantes. */
export function formatAmount(units: bigint): string {
  return formatUnits(units, AMOUNT_SCALE);
}

/** Número ya redondeado → decimal de la escala de la BD. */
export function decimalOf(value: number): string {
  return formatAmount(amountUnits(value.toFixed(AMOUNT_SCALE)) ?? 0n);
}
