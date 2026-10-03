// Aggregate portfolio valuation in one currency. Pure core. Used by the web app (Summary), the API
// (daily valuation, snapshots, alerts) and the MCP tool `get_portfolio_valuation`.

import { convertCurrency } from "../fx.js";

/** What a position needs in order to be valued in another currency. */
export interface ValuedPositionInput {
  quantity: number;
  avgPrice: number;
  /** Currency of the cost (`avgPrice`). */
  currency: string;
}

/** Latest close of an instrument, in its native currency. */
export interface DisplayPrice {
  close: number;
  currency: string;
}

/** Cost and market value of a position, both in the same currency. */
export interface DisplayValuation {
  invested: number;
  marketValue: number;
}

/**
 * The "valuable position" rule: cost (from the position's currency) and market value (from the
 * price's currency, which may differ) converted to `display`, or `null` if either rate is
 * missing. Requiring BOTH is what keeps P&L = value − invested consistent and makes the
 * allocation weights add up to the total.
 */
export function valueInDisplay(
  position: ValuedPositionInput,
  price: DisplayPrice,
  rates: Readonly<Record<string, number>>,
  display: string,
): DisplayValuation | null {
  const invested = convertCurrency(position.quantity * position.avgPrice, position.currency, display, rates);
  const marketValue = convertCurrency(position.quantity * price.close, price.currency, display, rates);
  return invested === null || marketValue === null ? null : { invested, marketValue };
}

/** Minimal input for aggregation, independent of the app's types. */
export interface AggregateInput {
  positions: (ValuedPositionInput & {
    ticker: string;
    /** Derivatives are not valued and stay out of the total; required so they never leak into the P&L. */
    isDerivative: boolean;
  })[];
  prices: Record<string, DisplayPrice>;
  rates: Record<string, number>;
  display: string;
}

export interface PortfolioAggregate {
  /** Cost of the valued positions, in `display`. */
  invested: number;
  marketValue: number;
  pnlAbs: number;
  pnlPct: number | null;
  valued: number;
  /** Number of valuable positions (valued + excluded for a missing price/currency); excludes derivatives. */
  total: number;
  display: string;
}

/**
 * Aggregates the portfolio into `display`. Counts a position that has a price and both currencies
 * convertible (see `valueInDisplay`). Invested, value and P&L use the same subset so that
 * P&L = value − invested holds.
 */
export function aggregatePortfolio({ positions, prices, rates, display }: AggregateInput): PortfolioAggregate {
  let invested = 0;
  let marketValue = 0;
  let valued = 0;

  // Sextante does not track derivative prices: without a reliable quote they would distort the P&L.
  const tracked = positions.filter((p) => !p.isDerivative);

  for (const p of tracked) {
    const price = prices[p.ticker];
    if (!price) continue;
    const valuation = valueInDisplay(p, price, rates, display);
    if (valuation === null) continue;

    invested += valuation.invested;
    marketValue += valuation.marketValue;
    valued += 1;
  }

  const pnlAbs = marketValue - invested;
  const pnlPct = invested > 0 ? (pnlAbs / invested) * 100 : null;
  return { invested, marketValue, pnlAbs, pnlPct, valued, total: tracked.length, display };
}
