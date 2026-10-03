import { z } from "zod";

import type { FireInput } from "./fire.js";
import { amount, frequency, percent } from "./schema-helpers.js";

export const fireSchema = z.strictObject({
  annualExpenses: amount("Desired annual spending once retired."),
  currentSavings: amount("Current invested wealth."),
  savings: amount("Savings per period until reaching FIRE."),
  frequency,
  annualReturn: percent("Expected REAL annual return.", -99, 100),
  withdrawalRate: percent("Safe withdrawal rate (typically 4)."),
  savingsGrowth: percent("Annual growth of the savings.", -100, 100).optional(),
}) satisfies z.ZodType<FireInput>;
