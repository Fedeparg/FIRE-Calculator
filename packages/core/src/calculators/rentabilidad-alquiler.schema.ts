import { z } from "zod";

import type { RentalInput } from "./rentabilidad-alquiler.js";
import { amount, percent } from "./schema-helpers.js";

export const rentalYieldSchema = z.strictObject({
  purchasePrice: amount("Purchase price."),
  purchaseCosts: amount("Purchase costs and taxes."),
  monthlyRent: amount("Monthly rent."),
  vacancyRate: percent("Non-payment or vacant months, % of the year (default 5%).").optional(),
  ibiAnnual: amount("Annual IBI (property tax).").optional(),
  communityMonthly: amount("Monthly community fee (cuota de comunidad).").optional(),
  insuranceAnnual: amount("Annual insurance (home + rent default).").optional(),
  maintenanceAnnual: amount("Annual maintenance.").optional(),
}) satisfies z.ZodType<RentalInput>;
