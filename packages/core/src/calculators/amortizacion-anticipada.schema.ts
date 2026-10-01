import { z } from "zod";

import type { EarlyRepaymentInput } from "./amortizacion-anticipada.js";
import { amount, horizon, percent } from "./schema-helpers.js";

export const earlyRepaymentSchema = z.strictObject({
  pendingPrincipal: amount("Capital pendiente."),
  annualRate: percent("TIN anual.", 0, 50),
  remainingYears: horizon("Plazo restante en años.", 50),
  extraPayment: amount("Importe a amortizar."),
  compensationRate: percent("Comisión por amortización, % de lo amortizado.", 0, 10).optional(),
}) satisfies z.ZodType<EarlyRepaymentInput>;
