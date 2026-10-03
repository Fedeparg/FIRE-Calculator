// Migrations (`MIGRATION`): custody change between TR entities, in outbound/inbound pairs.

import { firstItem } from "../../arrays.js";
import { absUnits, formatUnits, parseUnits } from "../decimal.js";
import type { ImportWarning } from "../types.js";
import { ISIN, isValidDate, normalizeDatetime, type Row, type SkipFn } from "./rows.js";

/** Scale at which migration quantities are compared (the export has up to 10 decimals). */
const MIGRATION_SCALE = 10;

/**
 * Window within which an outbound and an inbound migration count as the same one. In a real
 * export the two rows of a pair differ by a few milliseconds (3-6 ms) rather than matching the
 * exact instant; one second covers that gap without confusing distinct migrations.
 */
const MIGRATION_PAIR_WINDOW_MS = 1_000;

/**
 * Pairs migrations (outbound + inbound with the same ISIN and quantity, at almost the same
 * instant). Pairs are skipped as `migration_pair`; unpaired rows as `migration_unbalanced`, and
 * they raise a warning because they may hide missing or extra history. They do not claim their
 * `transaction_id`: they are never imported.
 */
export function resolveMigrations(migrations: readonly Row[], skip: SkipFn): ImportWarning[] {
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
    // `Date` only goes down to the millisecond: microseconds are trimmed before parsing.
    const ms = new Date(`${executedAt.slice(0, 23)}Z`).getTime();
    const key = `${row.symbol}|${formatUnits(absUnits(shares), MIGRATION_SCALE)}`;
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
