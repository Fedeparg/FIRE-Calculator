import { z } from "zod";

import { type GiftTaxInput, KINSHIP_GROUPS } from "./impuesto-donaciones.js";
import { amount, percent } from "./schema-helpers.js";

export const giftTaxSchema = z.strictObject({
  amount: amount("Valor de lo donado."),
  reduction: amount("Reducciones aplicables.").optional(),
  kinship: z
    .enum(KINSHIP_GROUPS)
    .optional()
    .describe(
      "Grupo de parentesco: grupoI_II (descendientes, cónyuge, ascendientes), grupoIII " +
        "(hermanos, sobrinos, tíos, afines) o grupoIV (resto).",
    ),
  preexistingWealth: amount("Patrimonio previo del donatario.").optional(),
  regionalRebate: percent("Bonificación autonómica sobre la cuota.").optional(),
}) satisfies z.ZodType<GiftTaxInput>;
