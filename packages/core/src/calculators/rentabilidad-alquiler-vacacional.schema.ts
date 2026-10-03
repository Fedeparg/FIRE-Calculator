import { z } from "zod";

import type { HolidayRentalInput } from "./rentabilidad-alquiler-vacacional.js";
import { amount, count, percent } from "./schema-helpers.js";

export const holidayRentalSchema = z.strictObject({
  purchasePrice: amount("Purchase price."),
  purchaseCosts: amount("Purchase costs and taxes."),
  nightlyRate: amount("Average price per night."),
  occupiedNights: count("Nights occupied per year.", 366),
  managementRate: percent("Platform/management fee on income."),
  cleaningFee: amount("Cleaning cost per stay.").optional(),
  avgStayNights: z.number().min(1).max(366).optional().describe("Average stay in nights (default 3)."),
  annualExpenses: amount("Fixed annual costs (IBI property tax, community fees, insurance, utilities…)."),
}) satisfies z.ZodType<HolidayRentalInput>;
