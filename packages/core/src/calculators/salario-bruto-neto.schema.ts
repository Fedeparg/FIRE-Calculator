import { z } from "zod";

import type { NetSalaryInput } from "../fiscal/irpf.js";
import { amount, personalCircumstances } from "./schema-helpers.js";

/** Net salary and payroll withholding share a model (`NetSalaryInput`) and therefore a schema. */
export const netSalarySchema = z.strictObject({
  grossAnnual: amount("Salario bruto anual en euros."),
  payments: z
    .union([z.literal(12), z.literal(14)])
    .optional()
    .describe("Número de pagas al año (12 o 14; por defecto 14)."),
  pensionContribution: amount("Aportación anual a plan de pensiones (reduce la base).").optional(),
  ...personalCircumstances,
}) satisfies z.ZodType<NetSalaryInput>;
