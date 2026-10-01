import { z } from "zod";

import type { MortgageInput } from "./hipoteca.js";
import { amount, horizon, percent } from "./schema-helpers.js";

export const mortgageSchema = z.strictObject({
  principal: amount("Capital prestado."),
  annualRate: percent("TIN anual.", 0, 50),
  years: horizon("Plazo en años.", 50),
  openingFeeRate: percent("Comisión de apertura, % del capital.", 0, 10).optional(),
  annualInsurance: amount("Coste anual de los productos vinculados.").optional(),
}) satisfies z.ZodType<MortgageInput>;
