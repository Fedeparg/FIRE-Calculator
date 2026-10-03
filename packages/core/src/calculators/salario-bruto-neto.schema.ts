import { z } from "zod";

import type { NetSalaryInput } from "../fiscal/irpf.js";
import { amount, personalCircumstances } from "./schema-helpers.js";

/** Net salary and payroll withholding share a model (`NetSalaryInput`) and therefore a schema. */
export const netSalarySchema = z.strictObject({
  grossAnnual: amount("Gross annual salary in euros."),
  payments: z
    .union([z.literal(12), z.literal(14)])
    .optional()
    .describe("Number of salary payments per year (12 or 14; default 14)."),
  pensionContribution: amount("Annual pension plan contribution (reduces the tax base).").optional(),
  ...personalCircumstances,
}) satisfies z.ZodType<NetSalaryInput>;
