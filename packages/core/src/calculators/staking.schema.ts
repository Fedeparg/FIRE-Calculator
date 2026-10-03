import { z } from "zod";

import { amount, horizon, percent } from "./schema-helpers.js";
import type { StakingInput } from "./staking.js";

export const stakingSchema = z.strictObject({
  principal: amount("Initial capital staked."),
  apy: percent("APY (compounded annual yield).", 0, 1000),
  years: horizon("Horizon in years."),
  withholdingRate: percent("Tax on the rewards (default 19%).").optional(),
}) satisfies z.ZodType<StakingInput>;
