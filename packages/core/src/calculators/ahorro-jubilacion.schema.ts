import { z } from "zod";

import type { RetirementInput } from "./ahorro-jubilacion.js";
import { amount, count, percent } from "./schema-helpers.js";

export const retirementSchema = z.strictObject({
  currentAge: count("Edad actual.", 100),
  retirementAge: count("Edad de jubilación.", 100),
  currentSavings: amount("Patrimonio invertido actual."),
  monthlySavings: amount("Aportación mensual hasta la jubilación."),
  annualReturn: percent("Rentabilidad anual NOMINAL esperada.", -99, 100),
  inflationRate: percent("Inflación media anual.", -50, 100).optional(),
  annualFee: percent("Comisión anual del producto (TER).").optional(),
  contributionGrowth: percent("Crecimiento anual de la aportación.", -100, 100).optional(),
}) satisfies z.ZodType<RetirementInput>;
