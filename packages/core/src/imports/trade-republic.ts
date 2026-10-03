// Parser for Trade Republic's "Exportación de transacciones" (transaction export, CSV). Pure
// logic: takes the text and returns normalized trades, skipped rows with their reason, and
// warnings.
//
// Privacy: the export has columns with third-party data (counterparty, IBAN, payment reference,
// MCC) and a free-text field per row (`description`). They are not read here: columns are accessed
// by name and only the ones needed, so that data dies with each record's `fields` array and never
// reaches any result, log or error message.
//
// This file orchestrates; each row type has its own module in `trade-republic/`.

import { compareStrings } from "../compare.js";
import { resolveBonusIssues } from "./trade-republic/bonus.js";
import { readDataRecords, TRADE_REPUBLIC_HEADER } from "./trade-republic/header.js";
import { INCOME_TYPES, resolveIncome } from "./trade-republic/income.js";
import { resolveMigrations } from "./trade-republic/migrations.js";
import { createImportContext, toRow, type Row } from "./trade-republic/rows.js";
import { parseTradeRow, skipReasonForType, type ParsedTrade, type TaxedBuy } from "./trade-republic/trades.js";
import type { ImportParseResult, ImportWarning } from "./types.js";

export {
  TRADE_REPUBLIC_HEADER,
  TradeRepublicParseError,
  type TradeRepublicParseErrorCode,
} from "./trade-republic/header.js";

/**
 * Parses Trade Republic's transaction export.
 *
 * Rules (verified against a real export):
 * - `BUY` and `SELL` are imported. The gross amount is `quantity × price`; the `amount` column is
 *   not used (there is an old buy with empty `amount` and `fee` that is still valid).
 * - `fee` is a trade cost and is stored as an absolute value. `tax` is not added to the cost. On
 *   saveback buys it is the 19% withholding on the reward and moves to its payout (see
 *   `resolveIncome`); for the rest we only warn how many trades carry it.
 * - `INTEREST_PAYMENT`, `BENEFITS_SAVEBACK`, `STOCKPERK` and `DIVIDEND` are payouts (`income`).
 *   The reward also arrives as a separate `BUY` for the same amount: that buy is imported with its
 *   cost. A dividend's withholdings are split with `resolveFromBroker`.
 * - `date` takes precedence over `datetime` as the trade date: it may differ from the UTC day.
 * - `MIGRATION` rows (custody change) come in outbound/inbound pairs with the same ISIN and
 *   quantity, a few milliseconds apart, with zero net effect: pairs are ignored and unpaired ones
 *   trigger a warning.
 * - `BONUS_ISSUE` rows (bonus issue: free new shares) are imported as a buy at price 0; a
 *   `BONUS_ISSUE_CANCELLED` voids the earlier issue with the same ISIN and quantity (TR sometimes
 *   cancels one and issues it again). See `resolveBonusIssues`.
 * - Every other type, crypto and currencies other than EUR are skipped with a reason; an unknown
 *   type never makes the import fail.
 *
 * @throws {TradeRepublicParseError} if the file as a whole is unusable.
 */
export function parseTradeRepublicCsv(text: string): ImportParseResult {
  const dataRecords = readDataRecords(text);
  const { context, skipped } = createImportContext();

  const parsed: ParsedTrade[] = [];
  const migrations: Row[] = [];
  const bonusIssues: Row[] = [];
  const incomeRows: Row[] = [];
  const taxedBuys: TaxedBuy[] = [];
  let tradesWithTax = 0;

  for (const record of dataRecords) {
    if (record.fields.length !== TRADE_REPUBLIC_HEADER.length) {
      context.skip({ line: record.line, type: "" }, "invalid_row");
      continue;
    }
    const row = toRow(record);

    if (row.type === "MIGRATION") {
      migrations.push(row);
    } else if (row.type === "BONUS_ISSUE" || row.type === "BONUS_ISSUE_CANCELLED") {
      bonusIssues.push(row);
    } else if (INCOME_TYPES.has(row.type)) {
      incomeRows.push(row);
    } else if (row.type !== "BUY" && row.type !== "SELL") {
      context.skip(row, skipReasonForType(row.type));
    } else {
      const result = parseTradeRow(row, context);
      if (!result) continue;
      parsed.push(result.parsed);
      if (result.tax !== 0n) tradesWithTax++;
      if (result.taxedBuy) taxedBuys.push(result.taxedBuy);
    }
  }

  // Order matters: each resolver claims the `transaction_id`s it accepts (see `ImportContext`).
  parsed.push(...resolveBonusIssues(bonusIssues, context));
  const { income, buysWithBenefitTax } = resolveIncome(incomeRows, migrations, taxedBuys, context);

  const warnings: ImportWarning[] = [...resolveMigrations(migrations, context.skip)];
  // The saveback withholding TR records on the associated buy is already in the payout: no warning.
  if (tradesWithTax - buysWithBenefitTax > 0) {
    warnings.push({ code: "trade_tax_ignored", count: tradesWithTax - buysWithBenefitTax });
  }

  // Stable: for the same instant, file order.
  parsed.sort((a, b) => compareStrings(a.trade.executedAt, b.trade.executedAt) || a.line - b.line);
  const trades = parsed.map(({ trade }) => trade);
  skipped.sort((a, b) => a.line - b.line);

  return { trades, income, skipped, warnings };
}
