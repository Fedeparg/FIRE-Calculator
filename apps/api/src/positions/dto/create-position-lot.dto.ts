import { z } from 'zod';

import type { PositionLotKind } from '../../db/schema.js';
import { amountSchema, quantitySchema, trimmedText } from './create-position.dto.js';

const POSITION_LOT_KINDS = ['buy', 'sell'] as const satisfies readonly PositionLotKind[];

/**
 * Cuerpo de POST /api/positions/:positionId/lots (`positionId` y `userId` vienen de la ruta y
 * el JWT). La fecha es `YYYY-MM-DD` (la columna `traded_at` es un `date`, sin hora) y debe existir
 * en el calendario: `z.iso.date` rechaza "2026-02-30".
 */
export const createPositionLotSchema = z.strictObject({
  kind: z.enum(POSITION_LOT_KINDS).describe('Tipo de operación: compra o venta.'),
  quantity: quantitySchema.describe('Cantidad operada.'),
  price: amountSchema.describe('Precio unitario de la operación.'),
  /** Comisiones de la operación. No entran en el precio medio; se guardan para fiscalidad. */
  fees: amountSchema.optional().describe('Comisiones (opcional).'),
  tradedAt: z.iso
    .date({ error: 'tradedAt debe ser una fecha real con el formato YYYY-MM-DD' })
    .describe('Fecha de la operación en formato YYYY-MM-DD.'),
  note: trimmedText(200).optional().describe('Nota libre (opcional).'),
});

export type CreatePositionLotDto = z.infer<typeof createPositionLotSchema>;
