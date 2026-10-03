import { z } from "zod";

import type { MortgageInput } from "./hipoteca.js";
import { amount, horizon, percent } from "./schema-helpers.js";

export const mortgageSchema = z.strictObject({
  principal: amount("Loan principal."),
  annualRate: percent("TIN (nominal annual rate).", 0, 50),
  years: horizon("Term in years.", 50),
  openingFeeRate: percent("Opening fee (comisión de apertura), % of the principal.", 0, 10).optional(),
  annualInsurance: amount("Annual cost of the bundled products (vinculaciones).").optional(),
}) satisfies z.ZodType<MortgageInput>;
