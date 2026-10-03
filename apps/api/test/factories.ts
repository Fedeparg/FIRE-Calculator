import { firstItem } from '@sextante/core/arrays';

import type { Database } from '../src/db/database.module.js';
import { positions, type incomeEvents, type positionLots } from '../src/db/schema.js';

/**
 * Fábricas de datos y dobles para los tests de la API. Las `make*` devuelven la fila a insertar
 * con valores por defecto razonables (cada test sobrescribe solo lo que le importa); las `seed*`
 * además la insertan y devuelven la fila guardada.
 */

type NewPosition = typeof positions.$inferInsert;
type NewLot = typeof positionLots.$inferInsert;
type NewIncome = typeof incomeEvents.$inferInsert;

/** Posición vacía de `userId` (la foto real la recalculan los lotes). */
export function makePosition(userId: string, overrides: Partial<NewPosition> = {}): NewPosition {
  return { userId, ticker: 'IWDA', quantity: '0', avgPrice: '0', ...overrides };
}

/** Compra de una unidad a 100 el 2 de enero de 2026. */
export function makeLot(userId: string, positionId: string, overrides: Partial<NewLot> = {}): NewLot {
  return { userId, positionId, kind: 'buy', quantity: '1', price: '100', tradedAt: '2026-01-02', ...overrides };
}

/** Dividendo manual en euros de 1 € íntegro, sin retenciones. */
export function makeIncome(userId: string, overrides: Partial<NewIncome> = {}): NewIncome {
  return { userId, kind: 'dividend', paidAt: '2025-08-06', gross: '1', source: 'manual', ...overrides };
}

/** Inserta una posición (ver `makePosition`) y devuelve la fila guardada. */
export async function seedPosition(
  db: Database,
  userId: string,
  overrides: Partial<NewPosition> = {},
): Promise<typeof positions.$inferSelect> {
  return firstItem(await db.insert(positions).values(makePosition(userId, overrides)).returning());
}

/**
 * Doble de prueba: un objeto que implementa solo lo que usa el test, tipado como la dependencia
 * real. Es el ÚNICO sitio con ese cast: así se ve qué tests trabajan con dobles parciales.
 */
export function stub<T>(implementation: object): T {
  return implementation as T;
}
