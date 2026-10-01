import { z } from "zod";

import type { AffordabilityInput } from "./hipoteca-asequible.js";
import { amount, horizon, percent } from "./schema-helpers.js";

export const affordabilitySchema = z.strictObject({
  netMonthlyIncome: amount("Ingresos mensuales netos del hogar."),
  monthlyDebts: amount("Otras cuotas mensuales de deuda."),
  downPayment: amount("Ahorro disponible para la entrada y los gastos."),
  annualRate: percent("TIN anual de la hipoteca.", 0, 50),
  termYears: horizon("Plazo en años.", 50),
  effortRatio: percent("Ratio de esfuerzo máximo (por defecto 35 %).").optional(),
  maxLtv: percent("% máximo del precio que financia el banco (por defecto 80 %).").optional(),
  purchaseCostsRate: percent("Gastos de compra, % del precio (por defecto 12 %).").optional(),
}) satisfies z.ZodType<AffordabilityInput>;
