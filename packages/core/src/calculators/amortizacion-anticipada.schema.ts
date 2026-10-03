import { z } from "zod";

import type { EarlyRepaymentInput } from "./amortizacion-anticipada.js";
import { amount, horizon, percent } from "./schema-helpers.js";

export const earlyRepaymentSchema = z.strictObject({
  pendingPrincipal: amount("Outstanding principal."),
  annualRate: percent("TIN (nominal annual rate).", 0, 50),
  remainingYears: horizon("Remaining term in years.", 50),
  extraPayment: amount("Amount to repay early."),
  compensationRate: percent(
    "Early repayment fee (comisión por amortización), % of the amount repaid.",
    0,
    10,
  ).optional(),
}) satisfies z.ZodType<EarlyRepaymentInput>;
