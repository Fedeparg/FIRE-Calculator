import { z } from "zod";

import type { HolidayRentalInput } from "./rentabilidad-alquiler-vacacional.js";
import { amount, count, percent } from "./schema-helpers.js";

export const holidayRentalSchema = z.strictObject({
  purchasePrice: amount("Precio de compra."),
  purchaseCosts: amount("Gastos e impuestos de compra."),
  nightlyRate: amount("Precio medio por noche."),
  occupiedNights: count("Noches ocupadas al año.", 366),
  managementRate: percent("Comisión de plataforma/gestión sobre ingresos."),
  cleaningFee: amount("Coste de limpieza por estancia.").optional(),
  avgStayNights: z.number().min(1).max(366).optional().describe("Estancia media en noches (por defecto 3)."),
  annualExpenses: amount("Gastos fijos anuales (IBI, comunidad, seguro, suministros…)."),
}) satisfies z.ZodType<HolidayRentalInput>;
