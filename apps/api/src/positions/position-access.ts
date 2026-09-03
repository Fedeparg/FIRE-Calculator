import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import type { Database } from '../db/database.module';
import { positions, type Position } from '../db/schema';

/** Cliente Drizzle o transacción: las consultas de acceso valen para ambos. */
export type DatabaseOrTransaction =
  | Database
  | Parameters<Parameters<Database['transaction']>[0]>[0];

/**
 * Localiza una posición por id VERIFICANDO propiedad: 404 si no existe, 403 si es de otro
 * usuario. Es la barrera de aislamiento entre usuarios de todo lo que cuelga de una posición.
 *
 * Vive fuera de `PositionsService` porque `PositionLotsService` necesita exactamente la misma
 * comprobación y hacer que dependiese del servicio de posiciones crearía un ciclo (el de
 * posiciones ya depende del de lotes para mantener sincronizados `quantity`/`avgPrice`).
 * Duplicar la regla de 404/403 en dos sitios sería mucho peor: es una regla de SEGURIDAD.
 */
export async function findOwnedPosition(
  db: DatabaseOrTransaction,
  userId: string,
  id: string,
): Promise<Position> {
  const [row] = await db.select().from(positions).where(eq(positions.id, id));
  if (!row) {
    throw new NotFoundException('Posición no encontrada');
  }
  if (row.userId !== userId) {
    throw new ForbiddenException('No puedes acceder a una posición que no es tuya');
  }
  return row;
}
