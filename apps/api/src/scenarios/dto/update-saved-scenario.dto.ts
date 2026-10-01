import { z } from 'zod';

import { SCENARIO_NAME_MAX_LENGTH } from '@sextante/core/contracts';

/**
 * Cuerpo de PATCH /api/scenarios/:id. Solo se puede renombrar y cambiar los `inputs`: el
 * `slug` no es editable a propósito, porque identifica qué calculadora es el escenario y
 * cambiarlo convertiría unos inputs en basura para la calculadora de destino. Para eso,
 * guardar uno nuevo.
 */
export const updateSavedScenarioSchema = z.strictObject({
  name: z.string().trim().min(1).max(SCENARIO_NAME_MAX_LENGTH).optional(),
  inputs: z.record(z.string(), z.unknown()).optional(),
});

export type UpdateSavedScenarioDto = z.infer<typeof updateSavedScenarioSchema>;
