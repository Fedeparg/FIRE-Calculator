import { EventEmitter2 } from '@nestjs/event-emitter';

import type { Database } from '../src/db/database.module.js';
import { PositionLotsService } from '../src/positions/position-lots.service.js';
import { PositionsService } from '../src/positions/positions.service.js';
import type { PricesService } from '../src/prices/prices.service.js';

/** `primeSymbol` solo refresca precio en caliente; en tests es un no-op. */
export const pricesStub = { primeSymbol: async () => {} } as unknown as PricesService;

export type PositionsStackOverrides = {
  prices?: PricesService;
  /** Emisor de `PositionsService` (p. ej. para capturar `LOT_CHANGED_EVENT` al editar). */
  positionsEvents?: EventEmitter2;
  /** Emisor de `PositionLotsService`. Separado del anterior a propósito: cada test captura uno. */
  lotsEvents?: EventEmitter2;
};

/**
 * Grafo `PositionsService` → `PositionLotsService` tal y como lo cablea Nest, con emisores de
 * eventos propios y precios en no-op salvo que el test los sustituya. Devuelve también los
 * emisores para poder observarlos.
 */
export function buildPositionsStack(db: Database, overrides: PositionsStackOverrides = {}) {
  const { prices = pricesStub, positionsEvents = new EventEmitter2(), lotsEvents = new EventEmitter2() } = overrides;
  const lots = new PositionLotsService(db, lotsEvents);
  const positions = new PositionsService(db, prices, lots, positionsEvents);
  return { positions, lots, prices, positionsEvents, lotsEvents };
}
