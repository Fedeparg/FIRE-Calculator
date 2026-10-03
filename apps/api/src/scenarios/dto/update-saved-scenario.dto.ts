import { z } from 'zod';

import { SCENARIO_NAME_MAX_LENGTH } from '@sextante/core/contracts';

/**
 * Body of PATCH /api/scenarios/:id. Only the name and the `inputs` can change: the `slug` is
 * deliberately not editable, because it identifies which calculator the scenario belongs to and
 * changing it would turn the inputs into garbage for the target calculator. Save a new one
 * instead.
 */
export const updateSavedScenarioSchema = z.strictObject({
  name: z.string().trim().min(1).max(SCENARIO_NAME_MAX_LENGTH).optional(),
  inputs: z.record(z.string(), z.unknown()).optional(),
});

export type UpdateSavedScenarioDto = z.infer<typeof updateSavedScenarioSchema>;
