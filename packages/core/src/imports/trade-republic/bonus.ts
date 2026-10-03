// Ampliaciones liberadas (`BONUS_ISSUE`) y sus cancelaciones (`BONUS_ISSUE_CANCELLED`).

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
