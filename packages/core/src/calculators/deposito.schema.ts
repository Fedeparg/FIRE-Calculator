import { z } from "zod";

import type { DepositInput } from "./deposito.js";
import { amount, horizon, percent } from "./schema-helpers.js";

export const depositSchema = z.strictObject({
  principal: amount("Deposited principal."),
  apr: percent("TAE (annual equivalent rate, APY).", 0, 50),
  years: horizon("Term in years (decimals allowed: 0.5 = 6 months).", 50),
  withholdingRate: percent("Withholding tax on the interest (default 19%).").optional(),
  inflationRate: percent("Estimated annual inflation.", -50, 100).optional(),
}) satisfies z.ZodType<DepositInput>;
