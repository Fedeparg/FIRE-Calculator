import { z } from 'zod';

import { amountSchema, currencySchema, quantitySchema } from '../../common/dto/primitives.js';

/** Body of POST /api/positions/:id/combine: the new buy to merge; the currency must match the position's (the service rejects it otherwise). */
export const combinePositionSchema = z.strictObject({
  quantity: quantitySchema.describe('Cantidad de la nueva compra.'),
  avgPrice: amountSchema.describe('Precio de la nueva compra.'),
  currency: currencySchema.optional(),
});

export type CombinePositionDto = z.infer<typeof combinePositionSchema>;
