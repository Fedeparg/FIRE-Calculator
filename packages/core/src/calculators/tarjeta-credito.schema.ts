import { z } from "zod";

import { amount, percent } from "./schema-helpers.js";
import { type CreditCardInput, PAYMENT_MODES } from "./tarjeta-credito.js";

export const creditCardSchema = z.strictObject({
  balance: amount("Saldo pendiente."),
  annualRate: percent("Tipo de interés anual.", 0, 100),
  paymentMode: z.enum(PAYMENT_MODES).optional().describe("fixed (cuota fija) o percent (% del saldo con suelo)."),
  monthlyPayment: amount("Pago mensual fijo (modo fixed)."),
  minPercent: percent("Cuota mínima, % del saldo (modo percent).").optional(),
  minFloor: amount("Suelo de la cuota mínima (modo percent).").optional(),
}) satisfies z.ZodType<CreditCardInput>;
