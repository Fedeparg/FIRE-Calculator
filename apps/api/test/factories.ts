import { firstItem } from '@sextante/core/arrays';

import type { Database } from '../src/db/database.module.js';
import { positions, type incomeEvents, type positionLots } from '../src/db/schema.js';

/**
 * Data factories and test doubles for the API tests. The `make*` helpers return the row to insert
 * with sensible defaults (each test overrides only what it cares about); the `seed*` helpers also
 * insert it and return the stored row.
 */

type NewPosition = typeof positions.$inferInsert;
type NewLot = typeof positionLots.$inferInsert;
type NewIncome = typeof incomeEvents.$inferInsert;

/** Empty position for `userId` (the lots recompute the real state). */
export function makePosition(userId: string, overrides: Partial<NewPosition> = {}): NewPosition {
  return { userId, ticker: 'IWDA', quantity: '0', avgPrice: '0', ...overrides };
}

/** Purchase of one unit at 100 on 2 January 2026. */
export function makeLot(userId: string, positionId: string, overrides: Partial<NewLot> = {}): NewLot {
  return { userId, positionId, kind: 'buy', quantity: '1', price: '100', tradedAt: '2026-01-02', ...overrides };
}

/** Manual dividend in euros of €1 gross, with no withholding. */
export function makeIncome(userId: string, overrides: Partial<NewIncome> = {}): NewIncome {
  return { userId, kind: 'dividend', paidAt: '2025-08-06', gross: '1', source: 'manual', ...overrides };
}

/** Inserts a position (see `makePosition`) and returns the stored row. */
export async function seedPosition(
  db: Database,
  userId: string,
  overrides: Partial<NewPosition> = {},
): Promise<typeof positions.$inferSelect> {
  return firstItem(await db.insert(positions).values(makePosition(userId, overrides)).returning());
}

/**
 * Test double: an object implementing only what the test uses, typed as the real dependency.
 * It is the ONLY place with that cast, which makes it visible which tests use partial doubles.
 */
export function stub<T>(implementation: object): T {
  return implementation as T;
}
