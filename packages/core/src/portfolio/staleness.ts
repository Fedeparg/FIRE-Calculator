import { itemAt } from "../arrays.js";
import { compareStrings } from "../compare.js";
/**
 * Real snapshots of the portfolio history that have gone stale. Pure core.
 *
 * A snapshot dated `D` written at `W` is stale if there is a lot with `tradedAt <= D` whose last
 * change is later than `W` (e.g. a back-dated trade was imported): otherwise the series would show a
 * false step. Deleted lots leave no trace: the caller passes `invalidateFrom` and snapshots dated
 * `>= invalidateFrom` are invalidated.
 */

export interface StalenessLot {
  /** Trade date, YYYY-MM-DD. */
  tradedAt: string;
  /** Last change of the lot (creation or edit), in milliseconds since epoch. */
  changedAt: number;
}

/** Real snapshot reduced to what matters for the rule. */
export interface StalenessSnapshot {
  /** Snapshot date, YYYY-MM-DD. */
  date: string;
  /** Instant the snapshot was written, in milliseconds since epoch. */
  writtenAt: number;
}

export interface StalenessInput {
  snapshots: readonly StalenessSnapshot[];
  lots: readonly StalenessLot[];
  /** Date from which everything is considered stale (lot deleted or moved); `null` if not applicable. */
  invalidateFrom?: string | null;
}

const byDate = (a: string, b: string): number => compareStrings(a, b);

/** Dates (YYYY-MM-DD) of the stale snapshots, in O(n log n). */
export function staleSnapshotDates(input: StalenessInput): Set<string> {
  const { snapshots, lots, invalidateFrom = null } = input;
  const stale = new Set<string>();

  const lotsByDate = [...lots].sort((a, b) => byDate(a.tradedAt, b.tradedAt));
  const snapshotsByDate = [...snapshots].sort((a, b) => byDate(a.date, b.date));

  // Most recent change among the lots with `tradedAt <= snapshot date`.
  let latestChange = Number.NEGATIVE_INFINITY;
  let next = 0;
  for (const snapshot of snapshotsByDate) {
    while (next < lotsByDate.length && itemAt(lotsByDate, next).tradedAt <= snapshot.date) {
      latestChange = Math.max(latestChange, itemAt(lotsByDate, next).changedAt);
      next += 1;
    }
    if (latestChange > snapshot.writtenAt || (invalidateFrom !== null && snapshot.date >= invalidateFrom)) {
      stale.add(snapshot.date);
    }
  }
  return stale;
}

/** Values of one history day, as stored (`numeric` as text, that day's FX rates). */
export interface SnapshotValues {
  /** Date, YYYY-MM-DD. */
  date: string;
  invested: string;
  marketValue: string;
  valuedPositions: number;
  totalPositions: number;
  fxRates: Record<string, number>;
}

/** Already-stored row: the values and whether it is a (reconstructed) estimate or a real snapshot. */
export interface StoredSnapshot extends SnapshotValues {
  estimated: boolean;
}

export interface SnapshotWritePlanInput<Row extends SnapshotValues> {
  /** Days produced by the reconstruction, without the `estimated` flag (the plan sets it). */
  rows: readonly Row[];
  /** What is already stored for the user. */
  existing: readonly StoredSnapshot[];
  /** Stale real snapshots (`staleSnapshotDates`): the only real ones that may be overwritten. */
  staleReal: ReadonlySet<string>;
  /** Start of tracking in Sextante (YYYY-MM-DD): before it, every day is an estimate. */
  trackingSince: string;
}

export interface SnapshotWritePlan<Row extends SnapshotValues> {
  /** Rows to write (upsert), already with `estimated = date < trackingSince`. */
  changed: (Row & { estimated: boolean })[];
  /** Dates of stored estimates the reconstruction no longer produces: they are removed. */
  stale: string[];
}

/** FX rate equality (a `jsonb` does not preserve key order). */
function sameRates(a: Record<string, number>, b: Record<string, number>): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key]);
}

/**
 * What to write after reconstructing a user's history: only the diff against what is stored
 * (rewriting ~1,800 identical rows every night adds nothing). Pure core.
 *
 * - A day without a stored row is written.
 * - A REAL snapshot is only replaced if it is stale (`staleReal`).
 * - An ESTIMATE is rewritten if any value changes or if its `estimated` flag no longer follows the
 *   rule (automatic repair).
 * - Stored estimates the reconstruction no longer produces (deleted trade...) are removed; real
 *   ones never are.
 */
export function planSnapshotWrites<Row extends SnapshotValues>(
  input: SnapshotWritePlanInput<Row>,
): SnapshotWritePlan<Row> {
  const { rows, existing, staleReal, trackingSince } = input;
  const existingByDate = new Map(existing.map((row) => [row.date, row]));
  const newDates = new Set(rows.map((row) => row.date));

  const changed = rows
    .map((row) => ({ ...row, estimated: row.date < trackingSince }))
    .filter((row) => {
      const current = existingByDate.get(row.date);
      if (!current) return true;
      if (!current.estimated) return staleReal.has(row.date);
      return !(
        current.estimated === row.estimated &&
        current.invested === row.invested &&
        current.marketValue === row.marketValue &&
        current.valuedPositions === row.valuedPositions &&
        current.totalPositions === row.totalPositions &&
        sameRates(current.fxRates, row.fxRates)
      );
    });
  const stale = existing.filter((row) => row.estimated && !newDates.has(row.date)).map((row) => row.date);
  return { changed, stale };
}
