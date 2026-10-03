// Entradas del informe fiscal compartidas por la web (`fetchRealisedGainsData`), la API
// (`TaxReturnService`) y el MCP: las posiciones con su histórico y los tipos del BCE que hay que
// pedir. Un solo sitio para que los tres canales monten el informe igual. Core puro.

import type { Position, PositionLot } from "../portfolio/types.js";
import { incomeRatesNeeded, type IncomeEvent } from "./income.js";
import type { TradeLot } from "./plusvalias.js";
import { referenceRatesNeeded, type RealisedGainsPosition, type ReferenceRatesRequest } from "./realised-gains.js";

/** Lo que el informe necesita de una posición (vale la `Position` de la web y la respuesta de la API). */
export type RealisedGainsPositionSource = Pick<Position, "id" | "ticker" | "name" | "currency" | "isDerivative">;

/** Una operación con la posición a la que pertenece (`GET /api/positions/lots`). */
export type RealisedGainsLotSource = TradeLot & Pick<PositionLot, "positionId">;

/**
 * Reparte las operaciones del usuario entre sus posiciones, en O(n). Cada posición conserva el
 * orden en que llegan sus operaciones; una sin operaciones queda con `lots: []`.
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
    // Un derivado no se empareja por FIFO con una acción del mismo símbolo.
    isDerivative: p.isDerivative,
    lots: byPosition.get(p.id) ?? [],
  }));
}

/**
 * Tipos del BCE que necesita el informe completo: las divisas de las ventas
 * (`referenceRatesNeeded`) y las de los cobros (`incomeRatesNeeded`), desde la operación o el
 * cobro más antiguo de todas ellas. `null` si todo es en euros.
 */
export function referenceRatesRequest(
  positions: readonly RealisedGainsPosition[],
  incomeEvents: readonly IncomeEvent[],
): ReferenceRatesRequest | null {
  const needed = [referenceRatesNeeded(positions), incomeRatesNeeded(incomeEvents)].filter((n) => n !== null);
  if (needed.length === 0) return null;
  const currencies = [...new Set(needed.flatMap((n) => n.currencies))].sort();
  // Fechas ISO `YYYY-MM-DD`: el orden lexicográfico es el cronológico.
  const from = needed.map((n) => n.from).reduce((min, date) => (date < min ? date : min));
  return { currencies, from };
}
