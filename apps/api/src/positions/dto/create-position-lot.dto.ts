import { z } from 'zod';

import type { PositionLotKind } from '../../db/schema.js';
import { amountSchema, quantitySchema, trimmedText } from '../../common/dto/primitives.js';

const POSITION_LOT_KINDS = ['buy', 'sell'] as const satisfies readonly PositionLotKind[];

/**
 * Body of POST /api/positions/:positionId/lots (`positionId` and `userId` come from the route and
 * the JWT). The date is `YYYY-MM-DD` (the `traded_at` column is a `date`, without time) and must
 * exist in the calendar: `z.iso.date` rejects "2026-02-30".
 */
export const createPositionLotSchema = z.strictObject({
  kind: z.enum(POSITION_LOT_KINDS).describe('Tipo de operación: compra o venta.'),
  quantity: quantitySchema.describe('Cantidad operada.'),
  price: amountSchema.describe('Precio unitario de la operación.'),
  /** Trade fees. Not included in the average price; stored for tax purposes. */
  fees: amountSchema.optional().describe('Comisiones (opcional).'),
  tradedAt: z.iso
    .date({ error: 'tradedAt debe ser una fecha real con el formato YYYY-MM-DD' })
    .describe('Fecha de la operación en formato YYYY-MM-DD.'),
  note: trimmedText(200).optional().describe('Nota libre (opcional).'),
});

export type CreatePositionLotDto = z.infer<typeof createPositionLotSchema>;
