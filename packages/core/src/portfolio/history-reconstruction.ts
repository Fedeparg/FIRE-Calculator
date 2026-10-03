/**
 * Reconstruction of the portfolio history from the trades (lots). Pure core.
 *
 * Each day values whatever was held that day (lots with `tradedAt <= day`, that day's close and FX)
 * with `aggregatePortfolio`; no history is invented before the first buy or after selling it all.
 *
 * Splits: the source's closes come adjusted (today's shares) but lot quantities are raw, so each lot
 * is multiplied by the ratio of the splits after its date (and its price divided, to preserve the
 * cost). Splits are re-fetched every 7 days.
 *
 * Limitations: broker bonuses arrive as a buy at price 0 and lower the average price with no special
 * handling; mergers, spin-offs and dividends are not modelled. Arithmetic in `number`: this is an
 * estimate for the chart, not an accounting figure.
 */

import { itemAt } from "../arrays.js";
import type { TradeLot } from "../fiscal/plusvalias.js";
import { QUANTITY_EPSILON } from "../inputs.js";
import { compareStrings } from "../compare.js";
import { addDays, daysBetween } from "../dates.js";
import { aggregatePortfolio, type AggregateInput, type PortfolioAggregate } from "./aggregate.js";

/**
 * Maximum days the last close/rate is carried forward when a day has no data of its own. Past that
 * margin there is no price that day (a gap beats a stale close); 10 covers Easter and Christmas.
 */
export const MAX_CARRY_FORWARD_DAYS = 10;

/** What the reconstruction uses from each trade. */
export type HistoryLot = Pick<TradeLot, "kind" | "quantity" | "price" | "tradedAt">;

export interface HistoryPosition {
  ticker: string;
  currency: string;
  isDerivative: boolean;
  /** Same-day lots are processed in the order received (`createdAt, id`): selling then rebuying is not the same as rebuying then selling. */
  lots: readonly HistoryLot[];
}

export interface PricePoint {
  date: string;
  close: number;
  currency: string;
}

/** Daily rate: USD per unit (the `aggregatePortfolio` convention). */
export interface FxPoint {
  date: string;
  rate: number;
}

/** Split: `ratio` = new shares per old share (10 for 10:1, 0.5 for a 1:2 reverse split). */
export interface SplitPoint {
  /** First trading day with the split applied. */
  date: string;
  ratio: number;
}

export interface HistoryInput {
  positions: readonly HistoryPosition[];
  prices: Readonly<Record<string, readonly PricePoint[]>>;
  /** Rates per currency (USD per unit), ascending; USD is not needed. */
  fx: Readonly<Record<string, readonly FxPoint[]>>;
  splits?: Readonly<Record<string, readonly SplitPoint[]>>;
  from: string;
  to: string;
  display: string;
}

export interface HistoryDay {
  date: string;
  aggregate: PortfolioAggregate;
  rates: Record<string, number>;
}

class SeriesCursor<T extends { date: string }> {
  private index = -1;

  constructor(private readonly series: readonly T[]) {}

  at(day: string): T | null {
    while (this.index + 1 < this.series.length && itemAt(this.series, this.index + 1).date <= day) {
      this.index += 1;
    }
    if (this.index < 0) return null;
    const point = itemAt(this.series, this.index);
    return daysBetween(point.date, day) <= MAX_CARRY_FORWARD_DAYS ? point : null;
  }
}

interface Holding {
  quantity: number;
  cost: number;
}

const emptyHolding = (): Holding => ({ quantity: 0, cost: 0 });

function applyLot(holding: Holding, lot: HistoryLot): void {
  if (lot.kind === "buy") {
    holding.quantity += lot.quantity;
    holding.cost += lot.quantity * lot.price;
    return;
  }
  // short positions are not supported: clamp to what is held
  const sold = Math.min(lot.quantity, holding.quantity);
  const remaining = holding.quantity - sold;
  if (remaining <= QUANTITY_EPSILON) {
    holding.quantity = 0;
    holding.cost = 0;
    return;
  }
  holding.cost = (holding.cost * remaining) / holding.quantity;
  holding.quantity = remaining;
}

/** Expresses the lots in today's shares; a same-day split does not count (the trade was already at the post-split price). */
function adjustForSplits(lots: readonly HistoryLot[], splits: readonly SplitPoint[]): HistoryLot[] {
  return lots.map((lot) => {
    let factor = 1;
    for (const split of splits) {
      if (split.date > lot.tradedAt && Number.isFinite(split.ratio) && split.ratio > 0) factor *= split.ratio;
    }
    return factor === 1 ? lot : { ...lot, quantity: lot.quantity * factor, price: lot.price / factor };
  });
}

/** Date of the oldest trade, or `null`; bounds where the reconstruction starts. */
export function firstTradeDate(positions: readonly HistoryPosition[]): string | null {
  let first: string | null = null;
  for (const position of positions) {
    for (const lot of position.lots) {
      if (first === null || lot.tradedAt < first) first = lot.tradedAt;
    }
  }
  return first;
}

/**
 * Day-by-day valuation between `from` and `to` (inclusive). Days without any valuable position are
 * skipped; if only some have a price, `aggregate.valued < aggregate.total`. A single linear pass
 * with cursors: O(days + lots + price points).
 */
export function reconstructHistory(input: HistoryInput): HistoryDay[] {
  const { positions, prices, fx, splits = {}, from, to, display } = input;
  if (from > to) return [];

  const state = positions.map((position) => ({
    position,
    // stable sort: same-day lots keep the order received
    lots: adjustForSplits(position.lots, splits[position.ticker] ?? []).sort((a, b) =>
      compareStrings(a.tradedAt, b.tradedAt),
    ),
    next: 0,
    holding: emptyHolding(),
    price: new SeriesCursor(prices[position.ticker] ?? []),
  }));
  const fxCursors = Object.entries(fx).map(([currency, series]) => ({
    currency,
    cursor: new SeriesCursor(series),
  }));

  const days: HistoryDay[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) {
    const rates: Record<string, number> = { USD: 1 };
    for (const { currency, cursor } of fxCursors) {
      const point = cursor.at(day);
      if (point && Number.isFinite(point.rate) && point.rate > 0) rates[currency] = point.rate;
    }

    const held: AggregateInput["positions"] = [];
    const dayPrices: AggregateInput["prices"] = {};
    for (const entry of state) {
      while (entry.next < entry.lots.length && itemAt(entry.lots, entry.next).tradedAt <= day) {
        applyLot(entry.holding, itemAt(entry.lots, entry.next));
        entry.next += 1;
      }
      if (entry.holding.quantity <= QUANTITY_EPSILON) continue; // not bought yet, or already sold

      const { ticker, currency, isDerivative } = entry.position;
      held.push({
        ticker,
        quantity: entry.holding.quantity,
        avgPrice: entry.holding.cost / entry.holding.quantity,
        currency,
        isDerivative,
      });
      const close = entry.price.at(day);
      if (close) dayPrices[ticker] = { close: close.close, currency: close.currency };
    }

    const aggregate = aggregatePortfolio({ positions: held, prices: dayPrices, rates, display });
    if (aggregate.valued === 0) continue;
    days.push({ date: day, aggregate, rates });
  }
  return days;
}
