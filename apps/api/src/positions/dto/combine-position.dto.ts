import { z } from 'zod';

import { amountSchema, currencySchema, quantitySchema } from '../../common/dto/primitives.js';

/** Body of POST /api/positions/:id/combine: the new buy to merge; the currency must match the position's (the service rejects it otherwise). */
export const combinePositionSchema = z.strictObject({
  quantity: quantitySchema.describe('Quantity of the new purchase.'),
  avgPrice: amountSchema.describe('Price of the new purchase.'),
  currency: currencySchema.optional(),
});

export type CombinePositionDto = z.infer<typeof combinePositionSchema>;
