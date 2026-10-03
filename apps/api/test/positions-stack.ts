import { EventEmitter2 } from '@nestjs/event-emitter';

import type { Database } from '../src/db/database.module.js';
import { PositionLotsService } from '../src/positions/position-lots.service.js';
import { PositionsService } from '../src/positions/positions.service.js';
import type { PriceHistoryService } from '../src/prices/price-history.service.js';
import { stub } from './factories.js';

/** `primeSymbol` only refreshes the price on the fly; in tests it is a no-op. */
export const pricesStub = stub<PriceHistoryService>({ primeSymbol: async () => {} });

export type PositionsStackOverrides = {
  prices?: PriceHistoryService;
  /** Emitter of `PositionsService` (e.g. to capture `LOT_CHANGED_EVENT` on edit). */
  positionsEvents?: EventEmitter2;
  /** Emitter of `PositionLotsService`. Kept separate from the previous one on purpose: each test captures one. */
  lotsEvents?: EventEmitter2;
};

/**
 * The `PositionsService` → `PositionLotsService` graph as Nest wires it, with their own event
 * emitters and no-op prices unless the test replaces them. Also returns the emitters so they can
 * be observed.
 */
export function buildPositionsStack(db: Database, overrides: PositionsStackOverrides = {}) {
  const { prices = pricesStub, positionsEvents = new EventEmitter2(), lotsEvents = new EventEmitter2() } = overrides;
  const lots = new PositionLotsService(db, lotsEvents);
  const positions = new PositionsService(db, prices, lots, positionsEvents);
  return { positions, lots, prices, positionsEvents, lotsEvents };
}
