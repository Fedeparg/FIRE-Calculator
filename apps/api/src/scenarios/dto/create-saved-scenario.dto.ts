import { z } from 'zod';

import { SCENARIO_NAME_MAX_LENGTH } from '@sextante/core/contracts';

/** Slug de calculadora, mismo formato que el `registry.ts` del frontend; acotarlo evita usarlo como cajón de sastre. */
export const calculatorSlugSchema = z
  .string()
  .trim()
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { error: 'slug debe ser un identificador en minúsculas separado por guiones' });

/**
 * Cuerpo de POST /api/scenarios (el `userId` sale del JWT). `inputs` se valida solo como objeto:
 * su esquema vive en el frontend; tamaño y número por usuario se acotan en el servicio.
 */
export const createSavedScenarioSchema = z.strictObject({
  slug: calculatorSlugSchema,
  name: z.string().trim().min(1).max(SCENARIO_NAME_MAX_LENGTH),
  inputs: z.record(z.string(), z.unknown()),
});

export type CreateSavedScenarioDto = z.infer<typeof createSavedScenarioSchema>;
