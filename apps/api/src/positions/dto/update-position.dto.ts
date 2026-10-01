import { z } from 'zod';

import { amountSchema, currencySchema, quantitySchema, trimmedText } from './create-position.dto.js';

/** Cuerpo de PATCH /api/positions/:id: campos opcionales, validados como en el alta (`ticker` y `broker` no pueden quedar vacíos). */
export const updatePositionSchema = z.strictObject({
  ticker: trimmedText(20).min(1).optional(),
  name: trimmedText(100).optional(),
  quantity: quantitySchema.optional(),
  avgPrice: amountSchema.optional(),
  broker: trimmedText(100).min(1).optional(),
  currency: currencySchema.optional(),
});

export type UpdatePositionDto = z.infer<typeof updatePositionSchema>;
