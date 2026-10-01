import type { z } from 'zod';

import { createPositionLotSchema } from './create-position-lot.dto.js';

/** Cuerpo de PATCH de un lote: campos opcionales, validados como en el alta. Si al reagregar la posición quedara en negativo, no se guarda nada. */
export const updatePositionLotSchema = createPositionLotSchema.partial();

export type UpdatePositionLotDto = z.infer<typeof updatePositionLotSchema>;
