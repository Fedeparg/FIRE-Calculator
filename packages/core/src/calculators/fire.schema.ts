import { z } from "zod";

import type { FireInput } from "./fire.js";
import { amount, frequency, percent } from "./schema-helpers.js";

export const fireSchema = z.strictObject({
  annualExpenses: amount("Gasto anual deseado una vez retirado."),
  currentSavings: amount("Patrimonio invertido actual."),
  savings: amount("Ahorro por periodo hasta alcanzar FIRE."),
  frequency,
  annualReturn: percent("Rentabilidad anual REAL esperada.", -99, 100),
  withdrawalRate: percent("Tasa de retiro segura (habitual: 4)."),
  savingsGrowth: percent("Crecimiento anual del ahorro.", -100, 100).optional(),
}) satisfies z.ZodType<FireInput>;
