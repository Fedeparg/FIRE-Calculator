// Tax report inputs shared by the web app (`fetchRealisedGainsData`), the API
// (`TaxReturnService`) and MCP: the positions with their history and the ECB rates to request.
// A single place so all three channels build the report the same way. Pure core module.

import type { Position, PositionLot } from "../portfolio/types.js";
import { incomeRatesNeeded, type IncomeEvent } from "./income.js";
import type { TradeLot } from "./plusvalias.js";
import { referenceRatesNeeded, type RealisedGainsPosition, type ReferenceRatesRequest } from "./realised-gains.js";

/** What the report needs from a position (both the web `Position` and the API response work). */
export type RealisedGainsPositionSource = Pick<Position, "id" | "ticker" | "name" | "currency" | "isDerivative">;

/** A transaction with the position it belongs to (`GET /api/positions/lots`). */
export type RealisedGainsLotSource = TradeLot & Pick<PositionLot, "positionId">;

/**
 * Distributes the user's transactions among their positions, in O(n). Each position keeps the
 * order its transactions arrive in; one with no transactions ends up with `lots: []`.
 */
export function toRealisedGainsPositions<L extends RealisedGainsLotSource>(
  positions: readonly RealisedGainsPositionSource[],
  lots: readonly L[],
): RealisedGainsPosition[] {
  const byPosition = new Map<string, L[]>();
  for (const lot of lots) {
    const list = byPosition.get(lot.positionId);
    if (list) list.push(lot);
    else byPosition.set(lot.positionId, [lot]);
  }
  return positions.map((p) => ({
    id: p.id,
    ticker: p.ticker,
    name: p.name,
    currency: p.currency,
    // A derivative is not FIFO-matched with a share of the same symbol.
    isDerivative: p.isDerivative,
    lots: byPosition.get(p.id) ?? [],
  }));
}

/**
 * ECB rates the full report needs: the currencies of the sales (`referenceRatesNeeded`) and of
 * the income payments (`incomeRatesNeeded`), from the oldest transaction or payment across all
 * of them. `null` if everything is in euros.
 */
export function referenceRatesRequest(
  positions: readonly RealisedGainsPosition[],
  incomeEvents: readonly IncomeEvent[],
): ReferenceRatesRequest | null {
  const needed = [referenceRatesNeeded(positions), incomeRatesNeeded(incomeEvents)].filter((n) => n !== null);
  if (needed.length === 0) return null;
  const currencies = [...new Set(needed.flatMap((n) => n.currencies))].sort();
  // ISO `YYYY-MM-DD` dates: lexicographic order is chronological order.
  const from = needed.map((n) => n.from).reduce((min, date) => (date < min ? date : min));
  return { currencies, from };
}
