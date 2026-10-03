import { z } from "zod";

import type { AffordabilityInput } from "./hipoteca-asequible.js";
import { amount, horizon, percent } from "./schema-helpers.js";

export const affordabilitySchema = z.strictObject({
  netMonthlyIncome: amount("Household net monthly income."),
  monthlyDebts: amount("Other monthly debt payments."),
  downPayment: amount("Savings available for the down payment and purchase costs."),
  annualRate: percent("Mortgage TIN (nominal annual rate).", 0, 50),
  termYears: horizon("Term in years.", 50),
  effortRatio: percent("Maximum debt-to-income ratio (ratio de esfuerzo, default 35%).").optional(),
  maxLtv: percent("Maximum % of the price the bank finances (loan-to-value, default 80%).").optional(),
  purchaseCostsRate: percent("Purchase costs, % of the price (default 12%).").optional(),
}) satisfies z.ZodType<AffordabilityInput>;
