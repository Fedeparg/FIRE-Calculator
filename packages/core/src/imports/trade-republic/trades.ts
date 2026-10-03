// Compras y ventas (`BUY`/`SELL`) → operaciones normalizadas.

import { absUnits } from "../decimal.js";
import type { ImportedTrade, ImportSkipReason } from "../types.js";
import {
  amountUnits,
  assetClassOf,
  claimTransactionId,
  formatAmount,
  isValidDate,
  ISIN,
  normalizeDatetime,
  type ImportContext,
  type Row,
} from "./rows.js";

/** Operación ya normalizada con la línea de su fila (para ordenar de forma estable). */
export type ParsedTrade = { trade: ImportedTrade; line: number };

/** Compra con retención en su fila: candidata a ser la retención de un saveback (ver `resolveIncome`). */
export type TaxedBuy = { row: Row; amount: bigint; tax: bigint };

/** Tipos que son solo movimientos de efectivo o de renta, sin efecto en las posiciones. */
export function skipReasonForType(type: string): ImportSkipReason {
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
 * Una fila `BUY`/`SELL` → operación, o `null` si se descarta (el motivo queda en `context`).
 * El importe bruto es `cantidad × precio`: la columna `amount` no se usa (hay una compra antigua
 * con `amount` y `fee` vacíos que sigue siendo válida). `fee` se guarda en valor absoluto y `tax`
 * no se suma al coste: se devuelve aparte para avisar o asignarlo a un saveback.
 */
export function parseTradeRow(
  row: Row,
  context: ImportContext,
): { parsed: ParsedTrade; tax: bigint; taxedBuy: TaxedBuy | null } | null {
  if (/crypto/i.test(row.assetClass)) {
    context.skip(row, "crypto");
    return null;
  }
  if (row.currency !== "EUR") {
    context.skip(row, "unsupported_currency");
    return null;
  }

  const shares = amountUnits(row.shares);
  const price = amountUnits(row.price);
  const fee = row.fee === "" ? 0n : amountUnits(row.fee);
  const tax = row.tax === "" ? 0n : amountUnits(row.tax);
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
    context.skip(row, "invalid_row");
    return null;
  }
  if (!claimTransactionId(row, context)) return null;

  let taxedBuy: TaxedBuy | null = null;
  if (tax !== 0n && row.type === "BUY") {
    const amount = amountUnits(row.amount);
    if (amount !== null) taxedBuy = { row, amount: absUnits(amount), tax };
  }
  const trade: ImportedTrade = {
    externalId: row.transactionId,
    isin: row.symbol,
    name: row.name,
    assetClass: assetClassOf(row.assetClass),
    kind: row.type === "BUY" ? "buy" : "sell",
    quantity: formatAmount(absUnits(shares)),
    price: formatAmount(price),
    fees: formatAmount(absUnits(fee)),
    tradedAt: row.date,
    executedAt,
  };
  return { parsed: { trade, line: row.line }, tax, taxedBuy };
}
