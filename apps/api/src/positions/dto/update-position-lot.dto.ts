import type { z } from 'zod';

import { createPositionLotSchema } from './create-position-lot.dto.js';

/** Body of a lot PATCH: optional fields, validated as on creation. If re-aggregating would leave the position negative, nothing is saved. */
export const updatePositionLotSchema = createPositionLotSchema.partial();

export type UpdatePositionLotDto = z.infer<typeof updatePositionLotSchema>;
