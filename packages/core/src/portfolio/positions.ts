// Pure logic for the Positions tab (valuation, filter, search), shared by the list and the detail view so both show the same figure.

import { convertCurrency } from "../fx.js";
import { valueInDisplay } from "./aggregate.js";

export interface ValuablePosition {
  quantity: number;
  avgPrice: number;
  currency: string;
}

export interface ClosePrice {
  close: number;
  currency: string;
}

/** Valuation in the position's currency (the cost currency). */
export interface PositionValuation {
  invested: number;
  /** Market value in the position's currency; `null` without a price or a rate. */
  marketValue: number | null;
  pnlAbs: number | null;
  /** Also `null` when the invested amount is 0. */
  pnlPct: number | null;
}

/** Values a position; the price may be in another currency (a USD ETF bought in EUR) and it stays unvalued only without a rate. */
export function valuePosition(
  position: ValuablePosition,
  price: ClosePrice | undefined,
  rates: Record<string, number>,
): PositionValuation {
  const invested = position.quantity * position.avgPrice;
  const marketValue =
    price === undefined ? null : (valueInDisplay(position, price, rates, position.currency)?.marketValue ?? null);
  const pnlAbs = marketValue === null ? null : marketValue - invested;
  const pnlPct = pnlAbs !== null && invested > 0 ? (pnlAbs / invested) * 100 : null;
  return { invested, marketValue, pnlAbs, pnlPct };
}

/** Filter groups; a derivative always goes to "derivatives", whether closed or not. */
export const POSITION_FILTERS = ["open", "closed", "derivatives"] as const;
export type PositionFilter = (typeof POSITION_FILTERS)[number];

export interface FilterablePosition {
  ticker: string;
  name: string | null;
  broker: string | null;
  quantity: number;
  isDerivative: boolean;
}

export function positionFilterOf(position: FilterablePosition): PositionFilter {
  if (position.isDerivative) return "derivatives";
  return position.quantity > 0 ? "open" : "closed";
}

export function countByFilter(positions: readonly FilterablePosition[]): Record<PositionFilter, number> {
  const counts: Record<PositionFilter, number> = { open: 0, closed: 0, derivatives: 0 };
  for (const position of positions) counts[positionFilterOf(position)] += 1;
  return counts;
}

/** Lowercase and without accents. */
function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/** Matches the search box? Checks symbol, name and broker, ignoring case and accents; an empty query matches all. */
export function matchesQuery(position: FilterablePosition, query: string): boolean {
  const needle = normalize(query.trim());
  if (!needle) return true;
  return [position.ticker, position.name, position.broker].some(
    (field) => field !== null && normalize(field).includes(needle),
  );
}

export interface MoverPosition extends FilterablePosition {
  id: string;
}

export interface DailyPrice {
  close: number;
  previousClose: number | null;
}

export interface DailyMove {
  id: string;
  name: string;
  changePct: number;
}

/**
 * Open positions that moved the most today (in absolute value). It is the price change, independent
 * of currency and quantity; without a positive previous close there is no change and it is left out.
 */
export function dailyMovers(
  positions: readonly MoverPosition[],
  prices: Record<string, DailyPrice | undefined>,
  limit: number,
): DailyMove[] {
  const moves: DailyMove[] = [];
  for (const position of positions) {
    if (positionFilterOf(position) !== "open") continue;
    const price = prices[position.ticker];
    if (!price || price.previousClose === null || !(price.previousClose > 0)) continue;
    const changePct = (price.close / price.previousClose - 1) * 100;
    if (!Number.isFinite(changePct)) continue;
    moves.push({ id: position.id, name: position.name ?? position.ticker, changePct });
  }
  return moves.sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct)).slice(0, limit);
}

export interface DailyGain {
  abs: number;
  pct: number;
}

/**
 * Today's gain: quantity × (close − previous close) in the position's currency; the % is the
 * price's, as in `dailyMovers`. `null` without a price, a positive previous close, an open quantity
 * or a rate.
 */
export function dailyGain(
  position: ValuablePosition,
  price: (DailyPrice & ClosePrice) | undefined,
  rates: Record<string, number>,
): DailyGain | null {
  if (!price || price.previousClose === null || !(price.previousClose > 0)) return null;
  if (!(position.quantity > 0)) return null;
  const abs = convertCurrency(
    position.quantity * (price.close - price.previousClose),
    price.currency,
    position.currency,
    rates,
  );
  const pct = (price.close / price.previousClose - 1) * 100;
  if (abs === null || !Number.isFinite(abs) || !Number.isFinite(pct)) return null;
  return { abs, pct };
}
