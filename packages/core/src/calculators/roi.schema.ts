import { z } from "zod";

import type { RoiInput } from "./roi.js";
import { amount, horizon, percent } from "./schema-helpers.js";

export const roiSchema = z.strictObject({
  initial: amount("Initial investment."),
  final: amount("Final value or amount recovered."),
  years: horizon("Horizon in years, to annualise.").optional(),
  costs: amount("Transaction costs (fees, expenses).").optional(),
  income: amount("Income received during the investment (dividends, coupons…).").optional(),
  taxRate: percent("Tax on the gain (default 19%).").optional(),
}) satisfies z.ZodType<RoiInput>;
