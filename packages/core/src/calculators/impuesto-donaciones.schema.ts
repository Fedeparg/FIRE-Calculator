import { z } from "zod";

import { type GiftTaxInput, KINSHIP_GROUPS } from "./impuesto-donaciones.js";
import { amount, percent } from "./schema-helpers.js";

export const giftTaxSchema = z.strictObject({
  amount: amount("Value of the gift."),
  reduction: amount("Applicable reductions.").optional(),
  kinship: z
    .enum(KINSHIP_GROUPS)
    .optional()
    .describe(
      "Kinship group (grupo de parentesco): grupoI_II (descendants, spouse, ascendants), grupoIII " +
        "(siblings, nephews and nieces, uncles and aunts, in-laws) or grupoIV (everyone else).",
    ),
  preexistingWealth: amount("Recipient's pre-existing wealth.").optional(),
  regionalRebate: percent("Regional rebate (bonificación autonómica) on the tax due.").optional(),
}) satisfies z.ZodType<GiftTaxInput>;
