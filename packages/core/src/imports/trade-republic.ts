// Parser de la "Exportación de transacciones" (CSV) de Trade Republic. Lógica pura: recibe el
// texto y devuelve operaciones normalizadas, filas descartadas con su motivo y avisos.
//
// Privacidad: el export trae columnas con datos de terceros (contraparte, IBAN, referencia de
// pago, MCC) y un texto libre por fila (`description`). Aquí no se leen: se accede a las
// columnas por nombre y solo a las que hacen falta, así que esos datos mueren con el array
// `fields` de cada registro y no llegan a ningún resultado, log ni mensaje de error.

import { firstItem, itemAt } from "../arrays.js";
import { compareStrings } from "../compare.js";
import { addDays } from "../dates.js";
import { resolveFromBroker } from "../fiscal/dividend-resolution.js";
import { CsvSyntaxError, parseCsv, type CsvRecord } from "./csv.js";
import { MAX_IMPORT_ROWS } from "./limits.js";
import type {
  ImportedAssetClass,
  ImportedIncome,
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
    case "IPO_SUBSCRIPTION":
      return "ipo_subscription";
    case "CUSTOMER_INBOUND":
      return "cash_movement";
    default:
      // Ingresos y retiradas (`CUSTOMER_INBOUND`, `CUSTOMER_OUTBOUND_REQUEST`…), tarjeta y
      // transferencias: todo es efectivo, sin efecto en las posiciones.
      return type.startsWith("CARD_") || type.startsWith("TRANSFER_") || type.startsWith("CUSTOMER_")
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
  // El grupo de la fecha es obligatorio en `DATETIME`: si hay `match`, hay `base`.
  if (base === undefined) return null;
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
  amount: string;
  fee: string;
  tax: string;
  currency: string;
  originalAmount: string;
  originalCurrency: string;
  transactionId: string;
};

/** Fila de datos ya validada: tiene exactamente las columnas de `TRADE_REPUBLIC_HEADER`, en su orden. */
function toRow(record: CsvRecord): Row {
  const get = (column: (typeof TRADE_REPUBLIC_HEADER)[number]): string =>
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

/**
 * Parsea el export de transacciones de Trade Republic.
 *
 * Reglas (verificadas contra un export real):
 * - Se importan `BUY` y `SELL`. El importe bruto es `cantidad × precio`; la columna `amount`
 *   no se usa (hay una compra antigua con `amount` y `fee` vacíos que sigue siendo válida).
 * - `fee` es coste de la operación y se guarda en valor absoluto. `tax` no se suma al coste. En
 *   las compras de un saveback es la retención del 19 % de la recompensa y pasa a su cobro (ver
 *   `resolveIncome`); del resto solo se avisa de cuántas operaciones la traen.
 * - `INTEREST_PAYMENT`, `BENEFITS_SAVEBACK`, `STOCKPERK` y `DIVIDEND` son cobros (`income`). La
 *   recompensa llega además como una `BUY` aparte por el mismo importe: esa compra entra con su
 *   coste. Las retenciones de un dividendo se reparten con `resolveFromBroker`.
 * - `date` manda sobre `datetime` como fecha de operación: puede diferir del día UTC.
 * - Las `MIGRATION` (cambio de custodia) vienen en parejas salida/entrada con el mismo ISIN y
 *   cantidad, a pocos milisegundos entre sí, y efecto neto cero: se ignoran las parejas y se avisa de las sueltas.
 * - Las `BONUS_ISSUE` (ampliación liberada: acciones nuevas gratis) entran como compra a precio
 *   0; una `BONUS_ISSUE_CANCELLED` anula la emisión anterior del mismo ISIN y cantidad (TR a
 *   veces cancela una y la vuelve a emitir). Ver `resolveBonusIssues`.
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

  const skipped: ImportSkippedRow[] = [];
  const skip = (row: { line: number; type: string }, reason: ImportSkipReason): void => {
    skipped.push({ line: row.line, type: row.type, reason });
  };

  const parsed: { trade: ImportedTrade; line: number }[] = [];
  const migrations: Row[] = [];
  const bonusIssues: Row[] = [];
  const incomeRows: Row[] = [];
  /** Compras con retención en su fila: candidatas a ser la retención de un saveback (ver `resolveIncome`). */
  const taxedBuys: { row: Row; amount: bigint; tax: bigint }[] = [];
  const seenIds = new Set<string>();
  let tradesWithTax = 0;

  for (const record of dataRecords) {
    if (record.fields.length !== TRADE_REPUBLIC_HEADER.length) {
      skipped.push({ line: record.line, type: "", reason: "invalid_row" });
      continue;
    }
    const row = toRow(record);

    if (row.type === "MIGRATION") {
      migrations.push(row);
      continue;
    }
    if (row.type === "BONUS_ISSUE" || row.type === "BONUS_ISSUE_CANCELLED") {
      bonusIssues.push(row);
      continue;
    }
    if (INCOME_TYPES.has(row.type)) {
      incomeRows.push(row);
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
    const signMatches = shares !== null && (row.type === "BUY" ? shares > 0n : shares < 0n);

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

    if (tax !== 0n) {
      tradesWithTax++;
      const amount = parseUnits(row.amount, AMOUNT_SCALE);
      if (row.type === "BUY" && amount !== null) taxedBuys.push({ row, amount: amount < 0n ? -amount : amount, tax });
    }
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

  for (const bonus of resolveBonusIssues(bonusIssues, skip, seenIds)) parsed.push(bonus);

  const { income, buysWithBenefitTax } = resolveIncome(incomeRows, migrations, taxedBuys, skip, seenIds);

  const warnings: ImportWarning[] = [];
  warnings.push(...resolveMigrations(migrations, skip));
  // La retención de un saveback que TR anota en la compra asociada ya está en el cobro: no se avisa.
  if (tradesWithTax - buysWithBenefitTax > 0) {
    warnings.push({ code: "trade_tax_ignored", count: tradesWithTax - buysWithBenefitTax });
  }

  // Estable: ante el mismo instante, el orden del fichero.
  parsed.sort((a, b) => compareStrings(a.trade.executedAt, b.trade.executedAt) || a.line - b.line);
  const trades = parsed.map(({ trade }) => trade);
  skipped.sort((a, b) => a.line - b.line);

  return { trades, income, skipped, warnings };
}

/** Tipos de fila que son cobros. */
const INCOME_TYPES = new Set(["INTEREST_PAYMENT", "BENEFITS_SAVEBACK", "STOCKPERK", "DIVIDEND"]);

/** Número ya redondeado → decimal de la escala de la BD. */
function decimalOf(value: number): string {
  return formatUnits(parseUnits(value.toFixed(AMOUNT_SCALE), AMOUNT_SCALE) ?? 0n, AMOUNT_SCALE);
}

/**
 * Anulaciones de dividendos: TR a veces abona un dividendo provisional y luego lo anula con la
 * misma cantidad en negativo antes de abonar el definitivo. Cada anulación se empareja con el
 * abono anterior del mismo ISIN e importe y se descartan los dos.
 */
function reversedDividends(rows: readonly Row[]): Set<Row> {
  const dropped = new Set<Row>();
  const dividends = rows.filter((row) => row.type === "DIVIDEND");
  for (const reversal of dividends) {
    const amount = parseUnits(reversal.amount, AMOUNT_SCALE);
    if (amount === null || amount >= 0n) continue;
    const original = dividends.findLast(
      (row) =>
        !dropped.has(row) &&
        row !== reversal &&
        row.symbol === reversal.symbol &&
        row.date <= reversal.date &&
        parseUnits(row.amount, AMOUNT_SCALE) === -amount,
    );
    if (original) {
      dropped.add(original);
      dropped.add(reversal);
    }
  }
  return dropped;
}

/**
 * Día del cambio de custodia a la sucursal española de TR, o `null`. Desde el día siguiente TR
 * retiene en España e informa a la AEAT (modelos 187, 189, 193, 196…): esos cobros salen en el
 * borrador. Se reconoce por las filas `MIGRATION` (traspaso de valores entre las dos entidades);
 * sin ellas, por el primer interés con retención española (cuenta española desde el principio).
 */
function spanishBranchCutoff(
  migrations: readonly Row[],
  incomeRows: readonly Row[],
): { date: string; inclusive: boolean } | null {
  const migrationDates = migrations.map((row) => row.date).filter(isValidDate);
  if (migrationDates.length > 0) return { date: migrationDates.sort().at(-1) as string, inclusive: false };
  const withheld = incomeRows
    .filter(
      (row) =>
        row.type === "INTEREST_PAYMENT" && isValidDate(row.date) && (parseUnits(row.tax, AMOUNT_SCALE) ?? 0n) !== 0n,
    )
    .map((row) => row.date)
    .sort();
  return withheld.length > 0 ? { date: firstItem(withheld), inclusive: true } : null;
}

/**
 * Intereses y recompensas (saveback, stockperk) → cobros. TR declara las recompensas como
 * intereses, con su retención del 19 %. Entre julio y noviembre de 2025 esa retención no venía en
 * la fila del saveback sino en la compra que lo invierte (mismo día e importe): se toma de ahí.
 * Antes del cambio a la sucursal española no hay retención ni comunicación a la AEAT, y el
 * pagador es TR Alemania (país `DE`); después, España.
 */
function resolveIncome(
  rows: readonly Row[],
  migrations: readonly Row[],
  taxedBuys: { row: Row; amount: bigint; tax: bigint }[],
  skip: (row: { line: number; type: string }, reason: ImportSkipReason) => void,
  seenIds: Set<string>,
): { income: ImportedIncome[]; buysWithBenefitTax: number } {
  const cutoff = spanishBranchCutoff(migrations, rows);
  const reported = (date: string) => cutoff !== null && (cutoff.inclusive ? date >= cutoff.date : date > cutoff.date);
  const income: { item: ImportedIncome; line: number }[] = [];
  let buysWithBenefitTax = 0;
  const reversed = reversedDividends(rows);

  for (const row of rows) {
    if (reversed.has(row)) {
      skip(row, "dividend_reversed");
      continue;
    }
    const amount = parseUnits(row.amount, AMOUNT_SCALE);
    const ownTax = row.tax === "" ? 0n : parseUnits(row.tax, AMOUNT_SCALE);
    if (
      !isValidDate(row.date) ||
      row.transactionId === "" ||
      amount === null ||
      ownTax === null ||
      row.currency !== "EUR" ||
      (row.type === "DIVIDEND" && !ISIN.test(row.symbol))
    ) {
      skip(row, "invalid_row");
      continue;
    }
    if (seenIds.has(row.transactionId)) {
      skip(row, "duplicate_row");
      continue;
    }
    seenIds.add(row.transactionId);

    let tax = ownTax < 0n ? -ownTax : ownTax;
    if (row.type !== "INTEREST_PAYMENT" && tax === 0n) {
      const at = taxedBuys.findIndex((buy) => buy.row.date === row.date && buy.amount === amount);
      if (at !== -1) {
        const buy = firstItem(taxedBuys.splice(at, 1));
        tax = buy.tax < 0n ? -buy.tax : buy.tax;
        buysWithBenefitTax++;
      }
    }

    const isReported = reported(row.date);
    if (row.type === "DIVIDEND") {
      const country = row.symbol.slice(0, 2);
      const shares = parseUnits(row.shares, AMOUNT_SCALE);
      const original = row.originalCurrency === "" ? null : parseUnits(row.originalAmount, AMOUNT_SCALE);
      const originalCurrency =
        original !== null && /^[A-Z]{3}$/.test(row.originalCurrency) ? row.originalCurrency : null;
      const split = resolveFromBroker({
        amount: Number(formatUnits(amount, AMOUNT_SCALE)),
        tax: Number(formatUnits(tax, AMOUNT_SCALE)),
        originalAmount: originalCurrency && original !== null ? Number(formatUnits(original, AMOUNT_SCALE)) : null,
        reported: isReported,
        country,
      });
      income.push({
        line: row.line,
        item: {
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
          quantity: shares !== null && shares > 0n ? formatUnits(shares, AMOUNT_SCALE) : null,
          originalAmount: originalCurrency && original !== null ? formatUnits(original, AMOUNT_SCALE) : null,
          originalCurrency,
        },
      });
      continue;
    }
    // La sucursal española comunica a la AEAT los intereses del mes con fecha de su último día,
    // aunque los abone el día 1 del siguiente: así el de diciembre cuenta en su año, como en el borrador.
    const paidAt =
      row.type === "INTEREST_PAYMENT" && isReported && row.date.endsWith("-01") ? addDays(row.date, -1) : row.date;
    income.push({
      line: row.line,
      item: {
        externalId: row.transactionId,
        kind: row.type === "INTEREST_PAYMENT" ? "interest" : "benefit",
        paidAt,
        isin: null,
        name: null,
        country: isReported ? "ES" : "DE",
        currency: "EUR",
        gross: formatUnits(amount, AMOUNT_SCALE),
        withholdingOrigin: "0",
        withholdingSpain: formatUnits(tax, AMOUNT_SCALE),
        reportedToAeat: isReported,
        grossSource: "broker",
        withholdingOriginSource: "broker",
        quantity: null,
        originalAmount: null,
        originalCurrency: null,
      },
    });
  }

  income.sort((a, b) => compareStrings(a.item.paidAt, b.item.paidAt) || a.line - b.line);
  return { income: income.map(({ item }) => item), buysWithBenefitTax };
}

/**
 * Ampliaciones liberadas → compras a precio 0.
 *
 * Fiscalmente (art. 37.1.a LIRPF) las acciones liberadas no tienen coste: el de las antiguas
 * se reparte entre todas. Una compra a precio 0 da exactamente ese coste medio, que es lo que
 * usa la cartera. En el informe de plusvalías (FIFO) la venta total da la misma ganancia; una
 * venta parcial la reparte algo distinto, porque Hacienda asigna a las nuevas la antigüedad de
 * las antiguas y aquí llevan la fecha de la emisión.
 *
 * Cada `BONUS_ISSUE_CANCELLED` anula la emisión más reciente anterior a ella con el mismo ISIN
 * y cantidad; las dos se descartan. Una cancelación sin emisión que anular no resta nada.
 */
function resolveBonusIssues(
  rows: readonly Row[],
  skip: (row: { line: number; type: string }, reason: ImportSkipReason) => void,
  seenIds: Set<string>,
): { trade: ImportedTrade; line: number }[] {
  type Valid = { row: Row; shares: bigint; executedAt: string };
  const valid: Valid[] = [];
  for (const row of rows) {
    const shares = parseUnits(row.shares, AMOUNT_SCALE);
    const executedAt = normalizeDatetime(row.datetime);
    const signMatches = shares !== null && (row.type === "BONUS_ISSUE" ? shares > 0n : shares < 0n);
    if (
      !ISIN.test(row.symbol) ||
      !isValidDate(row.date) ||
      executedAt === null ||
      row.transactionId === "" ||
      !signMatches
    ) {
      skip(row, "invalid_row");
      continue;
    }
    if (seenIds.has(row.transactionId)) {
      skip(row, "duplicate_row");
      continue;
    }
    seenIds.add(row.transactionId);
    valid.push({ row, shares, executedAt });
  }
  valid.sort((a, b) => compareStrings(a.executedAt, b.executedAt) || a.row.line - b.row.line);

  const issued: Valid[] = [];
  for (const entry of valid) {
    if (entry.row.type === "BONUS_ISSUE") {
      issued.push(entry);
      continue;
    }
    const at = issued.findLastIndex((issue) => issue.row.symbol === entry.row.symbol && issue.shares === -entry.shares);
    if (at !== -1) skip(firstItem(issued.splice(at, 1)).row, "bonus_issue_cancelled");
    skip(entry.row, "bonus_issue_cancelled");
  }

  return issued.map(({ row, shares, executedAt }) => ({
    line: row.line,
    trade: {
      externalId: row.transactionId,
      isin: row.symbol,
      name: row.name,
      assetClass: assetClassOf(row.assetClass),
      kind: "buy",
      quantity: formatUnits(shares, AMOUNT_SCALE),
      price: "0",
      fees: "0",
      tradedAt: row.date,
      executedAt,
    },
  }));
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
      skip(firstItem(unmatched.splice(at, 1)).row, "migration_pair");
    }
    for (const { row } of [...loose, ...unmatched]) {
      skip(row, "migration_unbalanced");
      warnings.push({ code: "unbalanced_migration", isin: row.symbol, line: row.line });
    }
  }
  return warnings;
}
