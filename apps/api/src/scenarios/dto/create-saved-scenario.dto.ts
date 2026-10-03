import { z } from 'zod';

import { SCENARIO_NAME_MAX_LENGTH } from '@sextante/core/contracts';

/** Calculator slug, same format as the frontend's `registry.ts`; bounding it stops it becoming a catch-all field. */
export const calculatorSlugSchema = z
  .string()
  .trim()
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { error: 'slug debe ser un identificador en minúsculas separado por guiones' });

/**
 * Body of POST /api/scenarios (the `userId` comes from the JWT). `inputs` is only validated as an
 * object: its schema lives in the frontend; size and count per user are bounded in the service.
 */
export const createSavedScenarioSchema = z.strictObject({
  slug: calculatorSlugSchema,
  name: z.string().trim().min(1).max(SCENARIO_NAME_MAX_LENGTH),
  inputs: z.record(z.string(), z.unknown()),
});

export type CreateSavedScenarioDto = z.infer<typeof createSavedScenarioSchema>;
