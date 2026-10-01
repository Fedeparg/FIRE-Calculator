import { z } from 'zod';

import { calculatorSlugSchema } from './create-saved-scenario.dto.js';

/**
 * Query de GET /api/scenarios. Estricta: un filtro desconocido da 400 en vez de ignorarse en
 * silencio.
 */
export const savedScenariosQuerySchema = z.strictObject({
  /** Filtra por calculadora (p. ej. `?slug=fire-basico`). */
  slug: calculatorSlugSchema.optional(),
});

export type SavedScenariosQueryDto = z.infer<typeof savedScenariosQuerySchema>;
