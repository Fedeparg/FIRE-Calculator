import { z } from "zod";

import type { RentalInput } from "./rentabilidad-alquiler.js";
import { amount, percent } from "./schema-helpers.js";

export const rentalYieldSchema = z.strictObject({
  purchasePrice: amount("Precio de compra."),
  purchaseCosts: amount("Gastos e impuestos de compra."),
  monthlyRent: amount("Alquiler mensual."),
  vacancyRate: percent("Impago o meses vacíos, % del año (por defecto 5 %).").optional(),
  ibiAnnual: amount("IBI anual.").optional(),
  communityMonthly: amount("Cuota de comunidad mensual.").optional(),
  insuranceAnnual: amount("Seguro anual (hogar + impago).").optional(),
  maintenanceAnnual: amount("Mantenimiento anual.").optional(),
}) satisfies z.ZodType<RentalInput>;
