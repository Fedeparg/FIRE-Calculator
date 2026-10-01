import { z } from "zod";

import type { SelfEmployedInput } from "./irpf-autonomos.js";
import { amount, personalCircumstances } from "./schema-helpers.js";

export const selfEmployedSchema = z.strictObject({
  income: amount("Ingresos anuales de la actividad."),
  expenses: amount("Gastos deducibles anuales (sin la cuota de autónomos)."),
  socialSecurity: amount("Cuota anual de autónomos."),
  pensionContribution: amount("Aportación anual a plan de pensiones.").optional(),
  simplifiedRegime: z
    .boolean()
    .optional()
    .describe("Estimación directa simplificada (5 % de gastos de difícil justificación)."),
  ...personalCircumstances,
}) satisfies z.ZodType<SelfEmployedInput>;
