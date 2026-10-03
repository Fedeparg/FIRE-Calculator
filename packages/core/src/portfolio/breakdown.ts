// Portfolio composition by asset, broker or currency, with the weight of each group. Pure core.
// Same rule as `aggregatePortfolio`; excluded positions are counted so the UI can say so instead of
// splitting an incomplete total as if it were the real one.

import { compareStrings } from "../compare.js";
import { canConvert, convertCurrency } from "../fx.js";

export type BreakdownGroupBy = "asset" | "broker" | "currency";

export const BREAKDOWN_GROUPS: readonly BreakdownGroupBy[] = ["asset", "broker", "currency"];

export interface BreakdownInput {
  positions: readonly {
    ticker: string;
    name: string | null;
    quantity: number;
    broker: string | null;
    currency: string;
  }[];
  prices: Record<string, { close: number; currency: string }>;
  rates: Record<string, number>;
  display: string;
  groupBy: BreakdownGroupBy;
  /** Label for positions without a broker (translated by the caller: the core does not translate). */
  unknownBrokerLabel: string;
}

export interface BreakdownSlice {
  /** Stable key (ticker, broker or currency); doubles as the React `key`. */
  key: string;
  label: string;
  value: number;
  share: number;
  positions: number;
}

export interface BreakdownResult {
  slices: BreakdownSlice[];
  /** Sum of the groups: the value of everything that could be valued. */
  total: number;
  included: number;
  excluded: number;
}

/**
 * Splits the market value (not the cost: a composition donut shows today's exposure) across the
 * groups, from largest to smallest weight and by label on ties. A corrupt price that would yield a
 * negative value is discarded as not valuable.
 */
export function buildBreakdown({
  positions,
  prices,
  rates,
  display,
  groupBy,
  unknownBrokerLabel,
}: BreakdownInput): BreakdownResult {
  const groups = new Map<string, BreakdownSlice>();
  let total = 0;
  let included = 0;

  for (const position of positions) {
    const price = prices[position.ticker];
    if (!price) continue;

    const value = convertCurrency(position.quantity * price.close, price.currency, display, rates);
    if (value === null || !Number.isFinite(value) || value < 0) continue;
    // like `aggregatePortfolio`, the position's currency must convert or the weights would not match the total
    if (!canConvert(position.currency, display, rates)) continue;

    const { key, label } =
      groupBy === "asset"
        ? { key: position.ticker, label: position.name?.trim() || position.ticker }
        : groupBy === "broker"
          ? {
              key: position.broker?.trim() || "",
              label: position.broker?.trim() || unknownBrokerLabel,
            }
          : { key: position.currency, label: position.currency };

    const existing = groups.get(key);
    if (existing) {
      existing.value += value;
      existing.positions += 1;
    } else {
      groups.set(key, { key, label, value, share: 0, positions: 1 });
    }

    total += value;
    included += 1;
  }

  const slices = [...groups.values()]
    .map((slice) => ({ ...slice, share: total > 0 ? (slice.value / total) * 100 : 0 }))
    .sort((a, b) => b.value - a.value || compareStrings(a.label, b.label));

  return { slices, total, included, excluded: positions.length - included };
}
