// Buys and sells (`BUY`/`SELL`) → normalized trades.

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

/** Already normalized trade with its row's line (for stable sorting). */
export type ParsedTrade = { trade: ImportedTrade; line: number };

/** Buy with withholding on its row: a candidate for a saveback's withholding (see `resolveIncome`). */
export type TaxedBuy = { row: Row; amount: bigint; tax: bigint };

/** Types that are only cash or income movements, with no effect on positions. */
export function skipReasonForType(type: string): ImportSkipReason {
  switch (type) {
    case "IPO_SUBSCRIPTION":
      return "ipo_subscription";
    case "CUSTOMER_INBOUND":
      return "cash_movement";
    default:
      // Deposits and withdrawals (`CUSTOMER_INBOUND`, `CUSTOMER_OUTBOUND_REQUEST`…), card and
      // transfers: all cash, with no effect on positions.
      return type.startsWith("CARD_") || type.startsWith("TRANSFER_") || type.startsWith("CUSTOMER_")
        ? "cash_movement"
        : "unknown_type";
  }
}

/**
 * A `BUY`/`SELL` row → trade, or `null` if skipped (the reason is recorded in `context`).
 * The gross amount is `quantity × price`: the `amount` column is not used (there is an old buy
 * with empty `amount` and `fee` that is still valid). `fee` is stored as an absolute value and
 * `tax` is not added to the cost: it is returned separately to warn or assign it to a saveback.
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
  // BUY carries a positive quantity and SELL a negative one; anything else is a corrupt row.
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
