// Bonus issues (`BONUS_ISSUE`, ampliaciones liberadas) and their cancellations (`BONUS_ISSUE_CANCELLED`).

import { firstItem } from "../../arrays.js";
import { compareStrings } from "../../compare.js";
import {
  amountUnits,
  assetClassOf,
  claimTransactionId,
  formatAmount,
  ISIN,
  isValidDate,
  normalizeDatetime,
  type ImportContext,
  type Row,
} from "./rows.js";
import type { ParsedTrade } from "./trades.js";

/**
 * Bonus issues → buys at price 0.
 *
 * For tax purposes (art. 37.1.a LIRPF) bonus shares have no cost: the cost of the old shares is
 * spread across all of them. A buy at price 0 gives exactly that average cost, which is what the
 * portfolio uses. In the capital gains report (FIFO) a full sale gives the same gain; a partial
 * sale splits it somewhat differently, because the tax agency (Hacienda) gives the new shares the
 * holding period of the old ones, whereas here they carry the issue date.
 *
 * Each `BONUS_ISSUE_CANCELLED` voids the most recent earlier issue with the same ISIN and
 * quantity; both are skipped. A cancellation with no issue to void subtracts nothing.
 */
export function resolveBonusIssues(rows: readonly Row[], context: ImportContext): ParsedTrade[] {
  type Valid = { row: Row; shares: bigint; executedAt: string };
  const valid: Valid[] = [];
  for (const row of rows) {
    const shares = amountUnits(row.shares);
    const executedAt = normalizeDatetime(row.datetime);
    const signMatches = shares !== null && (row.type === "BONUS_ISSUE" ? shares > 0n : shares < 0n);
    if (
      !ISIN.test(row.symbol) ||
      !isValidDate(row.date) ||
      executedAt === null ||
      row.transactionId === "" ||
      !signMatches
    ) {
      context.skip(row, "invalid_row");
      continue;
    }
    if (!claimTransactionId(row, context)) continue;
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
    if (at !== -1) context.skip(firstItem(issued.splice(at, 1)).row, "bonus_issue_cancelled");
    context.skip(entry.row, "bonus_issue_cancelled");
  }

  return issued.map(({ row, shares, executedAt }) => ({
    line: row.line,
    trade: {
      externalId: row.transactionId,
      isin: row.symbol,
      name: row.name,
      assetClass: assetClassOf(row.assetClass),
      kind: "buy",
      quantity: formatAmount(shares),
      price: "0",
      fees: "0",
      tradedAt: row.date,
      executedAt,
    },
  }));
}
