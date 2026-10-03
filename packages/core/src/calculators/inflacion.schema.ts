import { z } from "zod";

import type { InflationInput } from "./inflacion.js";
import { amount, horizon, percent } from "./schema-helpers.js";

export const inflationSchema = z.strictObject({
  amount: amount("Reference amount (today)."),
  annualRate: percent("Average annual inflation.", -50, 100),
  years: horizon("Horizon in years."),
  nominalReturn: percent("Nominal return on the money (0 = idle).", -99, 100).optional(),
}) satisfies z.ZodType<InflationInput>;
