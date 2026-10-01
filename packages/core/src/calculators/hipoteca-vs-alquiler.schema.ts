import { z } from "zod";

import type { BuyVsRentInput } from "./hipoteca-vs-alquiler.js";
import { amount, horizon, percent } from "./schema-helpers.js";

export const buyVsRentSchema = z.strictObject({
  purchasePrice: amount("Precio de compra."),
  purchaseCosts: amount("Gastos e impuestos de compra."),
  downPayment: amount("Entrada aportada."),
  mortgageRate: percent("TIN de la hipoteca.", 0, 50),
  mortgageTerm: horizon("Plazo de la hipoteca en años.", 50),
  annualCostRate: percent("Gastos anuales de propiedad, % del precio (IBI, comunidad…)."),
  appreciationRate: percent("Revalorización anual del inmueble.", -50, 100),
  monthlyRent: amount("Alquiler mensual equivalente."),
  rentGrowthRate: percent("Subida anual del alquiler.", -50, 100),
  investmentReturn: percent("Rentabilidad anual de invertir el capital libre.", -99, 100),
  horizonYears: horizon("Horizonte de comparación en años.", 60),
  sellingCostsRate: percent("Gastos de venta al final, % del valor.").optional(),
}) satisfies z.ZodType<BuyVsRentInput>;
