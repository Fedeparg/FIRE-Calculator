import { z } from "zod";

import { amount, horizon, percent } from "./schema-helpers.js";
import type { StakingInput } from "./staking.js";

export const stakingSchema = z.strictObject({
  principal: amount("Capital inicial en staking."),
  apy: percent("APY (rendimiento anual compuesto).", 0, 1000),
  years: horizon("Horizonte en años."),
  withholdingRate: percent("Impuesto sobre las recompensas (por defecto 19 %).").optional(),
}) satisfies z.ZodType<StakingInput>;
