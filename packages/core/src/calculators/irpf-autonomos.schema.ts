import { z } from "zod";

import type { SelfEmployedInput } from "./irpf-autonomos.js";
import { amount, personalCircumstances } from "./schema-helpers.js";

export const selfEmployedSchema = z.strictObject({
  income: amount("Annual business income."),
  expenses: amount("Annual deductible expenses (excluding the self-employed social security fee, cuota de autónomos)."),
  socialSecurity: amount("Annual self-employed social security fee (cuota de autónomos)."),
  pensionContribution: amount("Annual pension plan contribution.").optional(),
  simplifiedRegime: z
    .boolean()
    .optional()
    .describe("Simplified direct assessment (estimación directa simplificada: 5% for hard-to-justify expenses)."),
  ...personalCircumstances,
}) satisfies z.ZodType<SelfEmployedInput>;
