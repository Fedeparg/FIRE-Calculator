import { z } from "zod";

import type { BudgetInput } from "./presupuesto.js";
import { amount } from "./schema-helpers.js";

export const budgetSchema = z.strictObject({
  income: amount("Ingresos mensuales netos."),
  needs: amount("Gasto mensual en necesidades (vivienda, comida, suministros…)."),
  wants: amount("Gasto mensual en deseos (ocio, caprichos…)."),
}) satisfies z.ZodType<BudgetInput>;
