import { z } from 'zod';

import { calculatorSlugSchema } from './create-saved-scenario.dto.js';

/**
 * Query of GET /api/scenarios. Strict: an unknown filter returns 400 instead of being silently
 * ignored.
 */
export const savedScenariosQuerySchema = z.strictObject({
  /** Filters by calculator (e.g. `?slug=fire-basico`). */
  slug: calculatorSlugSchema.optional(),
});

export type SavedScenariosQueryDto = z.infer<typeof savedScenariosQuerySchema>;
