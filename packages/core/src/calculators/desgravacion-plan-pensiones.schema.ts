import { z } from "zod";

import type { PensionReliefInput } from "./desgravacion-plan-pensiones.js";
import { amount, region } from "./schema-helpers.js";

export const pensionReliefSchema = z.strictObject({
  grossAnnual: amount("Gross annual salary."),
  contribution: amount("Annual individual contribution."),
  employerContribution: amount(
    "Annual employer contribution to an occupational pension plan (plan de empleo).",
  ).optional(),
  region,
}) satisfies z.ZodType<PensionReliefInput>;
