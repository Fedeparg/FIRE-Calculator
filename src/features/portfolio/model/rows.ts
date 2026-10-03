// Rows of the position list: valuation, weight, price freshness and sort data.
// Pure core (no React), testable.

import { convertCurrency } from "@sextante/core/fx";
import type { Position, PriceInfo } from "@sextante/core/portfolio/types";
import { isStalePrice } from "@sextante/core/portfolio/prices";
import { dailyGain, valuePosition, type PositionValuation } from "@sextante/core/portfolio/positions";
import type { SortableRow } from "./sort";

/** Which gain the column shows: today's (vs previous close) or the total (vs amount invested). */
export type GainMode = "today" | "total";

/** Enriched row: what is rendered and what is compared for sorting. */
export type PositionRow = PositionValuation & {
  position: Position;
  price: PriceInfo | undefined;
  /** Weight over the total, in % (0–100), or null if the row cannot be valued. */
  weight: number | null;
  stale: boolean;
  pending: boolean;
  /** Gain for the active mode (amount in the position's currency and %), or null without data. */
  gain: { abs: number; pct: number | null } | null;
  sortable: SortableRow;
};

/** Base currency for comparing amounts across positions (rates are USD per unit). */
const BASE_CURRENCY = "USD";

/**
 * Converts an amount to the base (USD) only to SORT amounts of positions in different currencies
 * fairly. `null` if the rate is missing (that row goes last). Never displayed.
 */
export function toBase(amount: number | null, currency: string, rates: Record<string, number>): number | null {
  if (amount === null) return null;
  if (currency === BASE_CURRENCY) return amount;
  const rate = rates[currency];
  return Number.isFinite(rate) && rate ? amount * rate : null;
}

export type BuildRowsInput = {
  positions: readonly Position[];
  /** Last known price per ticker. */
  prices: Record<string, PriceInfo>;
  rates: Record<string, number>;
  /** Currency of the total: each row's weight is computed in it. */
  display: string;
  /** Total market value in `display` (the weight's denominator). */
  total: number;
  /** Date of the portfolio's most recent price (freshness reference). */
  latestDate: string | null;
  /** Ids of the positions whose price is still being fetched. */
  pendingIds: ReadonlySet<string>;
  gainMode: GainMode;
};

export function buildPositionRows(input: BuildRowsInput): PositionRow[] {
  const { prices, rates, display, total, latestDate, pendingIds, gainMode } = input;
  return input.positions.map((position) => {
    const price = prices[position.ticker];
    const valuation = valuePosition(position, price, rates);
    const inDisplay =
      valuation.marketValue === null ? null : convertCurrency(valuation.marketValue, position.currency, display, rates);
    // Sorting by the gain column ALWAYS uses what is shown: the active mode's amount.
    const gain =
      gainMode === "today"
        ? dailyGain(position, price, rates)
        : valuation.pnlAbs === null
          ? null
          : { abs: valuation.pnlAbs, pct: valuation.pnlPct };
    return {
      ...valuation,
      gain,
      position,
      price,
      weight: inDisplay !== null && total > 0 ? (inDisplay / total) * 100 : null,
      stale: isStalePrice(price, latestDate),
      pending: pendingIds.has(position.id),
      sortable: {
        ticker: position.ticker,
        name: position.name ?? position.ticker,
        invested: toBase(valuation.invested, position.currency, rates),
        marketValue: toBase(valuation.marketValue, position.currency, rates),
        pnl: toBase(gain?.abs ?? null, position.currency, rates),
      },
    };
  });
}
