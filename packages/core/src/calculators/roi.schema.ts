import { z } from "zod";

import type { RoiInput } from "./roi.js";
import { amount, horizon, percent } from "./schema-helpers.js";

export const roiSchema = z.strictObject({
  initial: amount("Inversión inicial."),
  final: amount("Valor final o importe recuperado."),
  years: horizon("Horizonte en años, para anualizar.").optional(),
  costs: amount("Costes de la operación (comisiones, gastos).").optional(),
  income: amount("Rentas cobradas durante la inversión (dividendos, cupones…).").optional(),
  taxRate: percent("Impuesto sobre la ganancia (por defecto 19 %).").optional(),
}) satisfies z.ZodType<RoiInput>;
