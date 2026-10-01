import { NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import type { Database } from '../db/database.module.js';
import { positions, type Position } from '../db/schema.js';

export type DatabaseOrTransaction = Database | Parameters<Parameters<Database['transaction']>[0]>[0];

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
