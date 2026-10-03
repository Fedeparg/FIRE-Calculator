import { z } from "zod";

import type { SimpleInterestInput } from "./interes-simple.js";
import { amount, horizon, percent } from "./schema-helpers.js";

export const simpleInterestSchema = z.strictObject({
  principal: amount("Initial capital."),
  annualRate: percent("Annual interest rate (TIN, nominal annual rate)."),
  years: horizon("Term in years."),
  withholdingRate: percent("Withholding tax on the interest (default 19%).").optional(),
}) satisfies z.ZodType<SimpleInterestInput>;
