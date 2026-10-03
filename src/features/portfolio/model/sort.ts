// Sorting of the positions table. Pure core (no React), testable.
//
// The UI decorates each row with its comparable values, already normalized to a base currency
// (USD) so amounts can be compared across positions in different currencies. Only the
// comparison lives here: nulls always last, stable tie-break by ticker.

/** Field the positions table can be sorted by (the ones the UI offers). */
export type SortKey = "name" | "invested" | "marketValue" | "pnl";

/** Sort direction: descending (highest first) or ascending. */
export type SortDir = "asc" | "desc";

/** By default we sort by amount invested, highest first. It is the only field that is always
 *  defined (it does not depend on the market price having arrived), so the initial order is
 *  stable and does not reshuffle when prices load asynchronously. */
export const DEFAULT_SORT_KEY: SortKey = "invested";
export const DEFAULT_SORT_DIR: SortDir = "desc";

/**
 * Comparable values of a position, precomputed by the UI. Monetary amounts are converted to a
 * common base currency (USD); `null` if the exchange rate was missing. `pnl` is the same number
 * that is displayed (percentage or base amount) depending on the active mode.
 */
export interface SortableRow {
  /** Tie-break only: not a sortable column. */
  ticker: string;
  name: string | null;
  invested: number | null;
  marketValue: number | null;
  pnl: number | null;
}

/** Accent-insensitive localeCompare with numeric ordering inside strings. */
function compareStrings(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });
}

/**
 * Compares two rows by `key` in direction `dir`. Missing values (`null`) ALWAYS go last, in both
 * ascending and descending order (we do not want a "—" to sneak to the top).
 */
function compareRows(a: SortableRow, b: SortableRow, key: SortKey, dir: SortDir): number {
  const factor = dir === "asc" ? 1 : -1;

  if (key === "name") {
    const av = a.name;
    const bv = b.name;
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    return factor * compareStrings(av, bv);
  }

  const av = a[key];
  const bv = b[key];
  if (av === null && bv === null) return 0;
  if (av === null) return 1;
  if (bv === null) return -1;
  return factor * (av - bv);
}

/**
 * Sorts a list of rows (each with its `sortable`) by `key` and `dir`, without mutating the input.
 * `Array.prototype.sort` is stable, but we also break ties by ticker so the order is
 * deterministic even when two positions tie on the chosen field.
 */
export function sortPositions<T extends { sortable: SortableRow }>(
  rows: readonly T[],
  key: SortKey,
  dir: SortDir,
): T[] {
  return [...rows].sort((ra, rb) => {
    const primary = compareRows(ra.sortable, rb.sortable, key, dir);
    if (primary !== 0) return primary;
    return compareStrings(ra.sortable.ticker, rb.sortable.ticker);
  });
}
