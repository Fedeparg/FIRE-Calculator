import { z } from "zod";

import { amount, percent } from "./schema-helpers.js";
import { type CreditCardInput, PAYMENT_MODES } from "./tarjeta-credito.js";

export const creditCardSchema = z.strictObject({
  balance: amount("Outstanding balance."),
  annualRate: percent("Annual interest rate.", 0, 100),
  paymentMode: z
    .enum(PAYMENT_MODES)
    .optional()
    .describe("fixed (fixed payment) or percent (% of the balance, with a floor)."),
  monthlyPayment: amount("Fixed monthly payment (fixed mode)."),
  minPercent: percent("Minimum payment, % of the balance (percent mode).").optional(),
  minFloor: amount("Floor of the minimum payment (percent mode).").optional(),
}) satisfies z.ZodType<CreditCardInput>;
