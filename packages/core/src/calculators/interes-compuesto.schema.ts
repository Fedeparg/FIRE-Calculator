import { z } from "zod";

import type { CompoundInput } from "./interes-compuesto.js";
import { amount, compounding, frequency, horizon, percent } from "./schema-helpers.js";

export const compoundSchema = z.strictObject({
  initial: amount("Initial capital."),
  contribution: amount("Amount of each contribution."),
  frequency,
  compounding,
  annualRate: percent("Expected annual return.", -99, 100),
  years: horizon("Horizon in years."),
  annualFee: percent("Annual product fee (TER).").optional(),
  contributionGrowth: percent("Annual growth of the contribution.", -100, 100).optional(),
  inflationRate: percent("Estimated annual inflation, for the real value.", -50, 100).optional(),
}) satisfies z.ZodType<CompoundInput>;
