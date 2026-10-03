import { NotFoundException } from '@nestjs/common';
import { and, eq, sql, type SQL } from 'drizzle-orm';

import type { DatabaseOrTransaction } from '../db/database.module.js';
import { positions, type Position } from '../db/schema.js';

export type { DatabaseOrTransaction } from '../db/database.module.js';

/**
 * Localiza una posición verificando propiedad (404 tanto si no existe como si es de
 * otro usuario, para no revelar qué ids existen): barrera de aislamiento entre usuarios. Vive fuera de `PositionsService` para que
 * `PositionLotsService` la reutilice sin ciclo de dependencias; es una regla de seguridad y
 * no debe duplicarse.
 */
export async function findOwnedPosition(db: DatabaseOrTransaction, userId: string, id: string): Promise<Position> {
  const [row] = await db
    .select()
    .from(positions)
    .where(and(eq(positions.id, id), eq(positions.userId, userId)));
  if (!row) {
    throw new NotFoundException('Posición no encontrada');
  }
  return row;
}

/**
 * Condición "esta posición es de este bróker", sin distinguir mayúsculas: la misma regla que el
 * índice único `(user_id, ticker, lower(coalesce(broker, '')))` de `schema.ts`. Un solo sitio
 * para que el alta, la edición y la importación no la escriban cada uno a su manera.
 */
export function brokerEquals(broker: string): SQL {
  return sql`lower(${positions.broker}) = lower(${broker})`;
}
