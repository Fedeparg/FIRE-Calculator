import { z } from "zod";

import type { AveragePriceInput } from "./promediar-acciones.js";
import { amount } from "./schema-helpers.js";

export const averagePriceSchema = z.strictObject({
  purchases: z
    .array(
      z.object({
        price: amount("Precio por acción de la compra."),
        shares: amount("Número de acciones (admite fracciones)."),
        commission: amount("Comisión de la compra.").optional(),
      }),
    )
    .min(1)
    .max(500)
    .describe("Compras realizadas."),
  currentPrice: amount("Precio actual por acción (opcional).").optional(),
}) satisfies z.ZodType<AveragePriceInput>;
