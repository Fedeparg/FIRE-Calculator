import { NotFoundException } from '@nestjs/common';
import { and, eq, sql, type SQL } from 'drizzle-orm';

import type { DatabaseOrTransaction } from '../db/database.module.js';
import { positions, type Position } from '../db/schema.js';

export type { DatabaseOrTransaction } from '../db/database.module.js';

/**
 * Finds a position while checking ownership (404 whether it does not exist or belongs to another
 * user, so as not to reveal which ids exist): the isolation barrier between users. It lives outside
 * `PositionsService` so that `PositionLotsService` can reuse it without a dependency cycle; it is a
 * security rule and must not be duplicated.
 */
export async function findOwnedPosition(db: DatabaseOrTransaction, userId: string, id: string): Promise<Position> {
  const [row] = await db.select().from(positions).where(ownedPosition(userId, id));
  if (!row) {
    throw positionNotFound();
  }
  return row;
}

/**
 * Condition "position `id` belongs to `userId`". Writes by id use it on top of having called
 * `findOwnedPosition` first: defence in depth, so the barrier between users does not depend
 * solely on the order of the calls.
 */
export function ownedPosition(userId: string, id: string): SQL {
  return and(eq(positions.id, id), eq(positions.userId, userId)) as SQL;
}

/** The 404 for a missing or foreign position (same message on every path). */
export function positionNotFound(): NotFoundException {
  return new NotFoundException('Posición no encontrada');
}

/**
 * Condition "this position belongs to this broker", case-insensitive: the same rule as the unique
 * index `(user_id, ticker, lower(coalesce(broker, '')))` in `schema.ts`. A single place so that
 * creation, editing and import do not each write it their own way.
 */
export function brokerEquals(broker: string): SQL {
  return sql`lower(${positions.broker}) = lower(${broker})`;
}
