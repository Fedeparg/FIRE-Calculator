import { z } from 'zod';

import { amountSchema, currencySchema, quantitySchema } from '../../common/dto/primitives.js';

/** Cuerpo de POST /api/positions/:id/combine: la nueva compra a fusionar; la divisa debe coincidir con la de la posición (lo rechaza el servicio). */
export const combinePositionSchema = z.strictObject({
  quantity: quantitySchema.describe('Cantidad de la nueva compra.'),
  avgPrice: amountSchema.describe('Precio de la nueva compra.'),
  currency: currencySchema.optional(),
});

export type CombinePositionDto = z.infer<typeof combinePositionSchema>;
