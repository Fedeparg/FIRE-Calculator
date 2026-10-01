import { z } from "zod";

import type { DividendInput } from "./dividendos.js";
import { amount, horizon, percent } from "./schema-helpers.js";

export const dividendSchema = z.strictObject({
  shares: amount("Número de acciones."),
  dividendPerShare: amount("Dividendo anual por acción."),
  sharePrice: amount("Precio por acción, para la rentabilidad por dividendo.").optional(),
  withholdingRate: percent("Retención sobre los dividendos (por defecto 19 %).").optional(),
  annualGrowth: percent("Crecimiento anual del dividendo.", -100, 100).optional(),
  years: horizon("Horizonte de la proyección (0 = solo el primer año).").optional(),
}) satisfies z.ZodType<DividendInput>;
