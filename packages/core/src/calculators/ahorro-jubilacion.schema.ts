import { z } from "zod";

import type { RetirementInput } from "./ahorro-jubilacion.js";
import { amount, count, percent } from "./schema-helpers.js";

export const retirementSchema = z.strictObject({
  currentAge: count("Current age.", 100),
  retirementAge: count("Retirement age.", 100),
  currentSavings: amount("Current invested wealth."),
  monthlySavings: amount("Monthly contribution until retirement."),
  annualReturn: percent("Expected NOMINAL annual return.", -99, 100),
  inflationRate: percent("Average annual inflation.", -50, 100).optional(),
  annualFee: percent("Annual product fee (TER).").optional(),
  contributionGrowth: percent("Annual growth of the contribution.", -100, 100).optional(),
}) satisfies z.ZodType<RetirementInput>;
