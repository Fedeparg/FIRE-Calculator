import { z } from "zod";

import type { BuyVsRentInput } from "./hipoteca-vs-alquiler.js";
import { amount, horizon, percent } from "./schema-helpers.js";

export const buyVsRentSchema = z.strictObject({
  purchasePrice: amount("Purchase price."),
  purchaseCosts: amount("Purchase costs and taxes."),
  downPayment: amount("Down payment."),
  mortgageRate: percent("Mortgage TIN (nominal annual rate).", 0, 50),
  mortgageTerm: horizon("Mortgage term in years.", 50),
  annualCostRate: percent("Annual ownership costs, % of the price (IBI property tax, community fees…)."),
  appreciationRate: percent("Annual property appreciation.", -50, 100),
  monthlyRent: amount("Equivalent monthly rent."),
  rentGrowthRate: percent("Annual rent increase.", -50, 100),
  investmentReturn: percent("Annual return on investing the spare capital.", -99, 100),
  horizonYears: horizon("Comparison horizon in years.", 60),
  sellingCostsRate: percent("Selling costs at the end, % of the value.").optional(),
}) satisfies z.ZodType<BuyVsRentInput>;
