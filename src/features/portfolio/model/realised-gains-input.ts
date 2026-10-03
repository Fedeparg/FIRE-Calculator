// Entrada del informe de ganancias realizadas: las posiciones de la cartera con su histórico.

import type { RealisedGainsPosition } from "@sextante/core/fiscal/realised-gains";
import type { Position, PositionLot } from "@sextante/core/portfolio/types";

/** Reparte las operaciones del usuario (`GET /api/positions/lots`) entre sus posiciones. */
export function toRealisedGainsPositions(
  positions: readonly Position[],
  lots: readonly PositionLot[],
): RealisedGainsPosition[] {
  const byPosition = new Map<string, PositionLot[]>();
  for (const lot of lots) {
    const list = byPosition.get(lot.positionId) ?? [];
    list.push(lot);
    byPosition.set(lot.positionId, list);
  }
  return positions.map((p) => ({
    id: p.id,
    ticker: p.ticker,
    name: p.name,
    currency: p.currency,
    // Los derivados no están sujetos a la regla de los dos meses (DGT V2172-21).
    isDerivative: p.isDerivative,
    lots: byPosition.get(p.id) ?? [],
  }));
}
