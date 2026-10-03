import { z } from "zod";

import type { BudgetInput } from "./presupuesto.js";
import { amount } from "./schema-helpers.js";

export const budgetSchema = z.strictObject({
  income: amount("Net monthly income."),
  needs: amount("Monthly spending on needs (housing, food, utilities…)."),
  wants: amount("Monthly spending on wants (leisure, treats…)."),
}) satisfies z.ZodType<BudgetInput>;
