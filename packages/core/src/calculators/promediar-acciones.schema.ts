import { z } from "zod";

import type { AveragePriceInput } from "./promediar-acciones.js";
import { amount } from "./schema-helpers.js";

export const averagePriceSchema = z.strictObject({
  purchases: z
    .array(
      z.object({
        price: amount("Price per share of the purchase."),
        shares: amount("Number of shares (fractions allowed)."),
        commission: amount("Purchase fee.").optional(),
      }),
    )
    .min(1)
    .max(500)
    .describe("Purchases made."),
  currentPrice: amount("Current price per share (optional).").optional(),
}) satisfies z.ZodType<AveragePriceInput>;
