// Historical portfolio series for the chart. Pure core. The backend stores one daily point in euros
// and re-expresses it with each day's FX rates; here we only trim, drop non-convertible points and
// summarize the period.

import { firstItem, lastItem } from "../arrays.js";
import { compareStrings } from "../compare.js";
import type { HistoryPointDto } from "./types.js";

/** Point ready to plot. It is a `type` (not an `interface`) to get an implicit index signature: `TimeSeriesChart` takes `Record<string, …>`. */
export type HistoryChartPoint = {
  date: string;
  invested: number;
  marketValue: number;
  estimated: boolean;
};

export type HistoryRangeKey = "30d" | "90d" | "1y" | "all";

/** `all` requests the backend maximum (`HISTORY_MAX_DAYS` = 1825); going over returns a 400. */
export const HISTORY_RANGES: readonly { key: HistoryRangeKey; days: number }[] = [
  { key: "30d", days: 30 },
  { key: "90d", days: 90 },
  { key: "1y", days: 365 },
  { key: "all", days: 1825 },
];

export const DEFAULT_HISTORY_RANGE: HistoryRangeKey = "90d";

/** Minimum points to draw a line; with fewer (a new account) the UI explains instead of showing an empty canvas. */
export const MIN_HISTORY_POINTS = 2;

export interface HistorySeries {
  /** Complete points, in chronological order. */
  points: HistoryChartPoint[];
  /** Points dropped because they cannot be converted to the chosen currency. */
  dropped: number;
  insufficient: boolean;
  /** Change in market value between the first and the last point, or `null`. */
  changeAbs: number | null;
  /** The same change in %, or `null` if it started from 0. */
  changePct: number | null;
  from: string | null;
  to: string | null;
  /** Contiguous runs of `estimated` points; computed per run to tolerate rows the backfill did not repair. */
  estimatedRanges: { from: string; to: string }[];
}

/**
 * Turns the API response into a plottable series. A point without `invested` or `marketValue` was
 * not convertible that day: it is dropped and counted in `dropped`, instead of drawing a 0.
 */
export function buildHistorySeries(points: readonly HistoryPointDto[]): HistorySeries {
  const usable: HistoryChartPoint[] = [];
  let dropped = 0;

  for (const point of points) {
    if (
      point.invested === null ||
      point.marketValue === null ||
      !Number.isFinite(point.invested) ||
      !Number.isFinite(point.marketValue)
    ) {
      dropped += 1;
      continue;
    }
    usable.push({
      date: point.date,
      invested: point.invested,
      marketValue: point.marketValue,
      estimated: point.estimated,
    });
  }

  // sorting here avoids depending on the backend's order
  usable.sort((a, b) => compareStrings(a.date, b.date));

  const first = usable[0];
  const last = usable[usable.length - 1];
  const changeAbs = first && last && first !== last ? last.marketValue - first.marketValue : null;

  const estimatedRanges: { from: string; to: string }[] = [];
  let runStart: string | null = null;
  let runEnd = "";
  for (const point of usable) {
    if (point.estimated) {
      runStart ??= point.date;
      runEnd = point.date;
    } else if (runStart !== null) {
      estimatedRanges.push({ from: runStart, to: runEnd });
      runStart = null;
    }
  }
  if (runStart !== null) estimatedRanges.push({ from: runStart, to: runEnd });

  return {
    points: usable,
    dropped,
    insufficient: usable.length < MIN_HISTORY_POINTS,
    changeAbs,
    changePct:
      changeAbs !== null && first !== undefined && first.marketValue > 0 ? (changeAbs / first.marketValue) * 100 : null,
    from: first?.date ?? null,
    to: last?.date ?? null,
    estimatedRanges,
  };
}

export interface PeriodGain {
  gain: number;
  since: string;
  /** The starting point predates tracking in Sextante (reconstruction). */
  estimated: boolean;
}

/**
 * Gain since `from`: change in the cumulative gain (not in market value), so a mid-year
 * contribution does not count as return. Starts from the first point dated `>= from`; `null` with
 * fewer than two usable points.
 */
export function gainSince(points: readonly HistoryPointDto[], from: string): PeriodGain | null {
  const usable = points
    .filter((p): p is HistoryPointDto & { pnlAbs: number } => p.date >= from && Number.isFinite(p.pnlAbs))
    .sort((a, b) => compareStrings(a.date, b.date));
  if (usable.length < MIN_HISTORY_POINTS) return null;
  const first = firstItem(usable);
  const last = lastItem(usable);
  return { gain: last.pnlAbs - first.pnlAbs, since: first.date, estimated: first.estimated };
}

export interface LiveValuation {
  date: string;
  marketValue: number;
  invested: number;
  pnlAbs: number;
  pnlPct: number | null;
  valuedPositions: number;
  totalPositions: number;
}

/**
 * Appends the live valuation as the last point (the day's snapshot is written overnight). Only if it
 * is later than the last point and something is valued; if today already has a point, the snapshot
 * wins.
 */
export function withLivePoint(points: readonly HistoryPointDto[], live: LiveValuation | null): HistoryPointDto[] {
  if (!live || live.valuedPositions === 0 || !Number.isFinite(live.marketValue)) return [...points];
  const last = points.reduce<string | null>((max, p) => (max === null || p.date > max ? p.date : max), null);
  if (last !== null && last >= live.date) return [...points];
  return [...points, { ...live, estimated: false }];
}
