import { z } from "zod";

import type { PensionReliefInput } from "./desgravacion-plan-pensiones.js";
import { amount, region } from "./schema-helpers.js";

export const pensionReliefSchema = z.strictObject({
  grossAnnual: amount("Salario bruto anual."),
  contribution: amount("Aportación anual individual."),
  employerContribution: amount("Contribución anual de la empresa a un plan de empleo.").optional(),
  region,
}) satisfies z.ZodType<PensionReliefInput>;
