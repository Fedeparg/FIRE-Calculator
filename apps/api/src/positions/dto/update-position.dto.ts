import { z } from 'zod';

import {
  amountSchema,
  assetClassSchema,
  currencySchema,
  quantitySchema,
  trimmedText,
} from '../../common/dto/primitives.js';

/** Body of PATCH /api/positions/:id: optional fields, validated as on creation (`ticker` and `broker` cannot be left empty). */
export const updatePositionSchema = z.strictObject({
  ticker: trimmedText(20).min(1).optional(),
  name: trimmedText(100).optional(),
  quantity: quantitySchema.optional(),
  avgPrice: amountSchema.optional(),
  broker: trimmedText(100).min(1).optional(),
  currency: currencySchema.optional(),
  assetClass: assetClassSchema.optional(),
});

export type UpdatePositionDto = z.infer<typeof updatePositionSchema>;
