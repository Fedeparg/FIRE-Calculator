import { z } from "zod";

import type { DividendInput } from "./dividendos.js";
import { amount, horizon, percent } from "./schema-helpers.js";

export const dividendSchema = z.strictObject({
  shares: amount("Number of shares."),
  dividendPerShare: amount("Annual dividend per share."),
  sharePrice: amount("Price per share, for the dividend yield.").optional(),
  withholdingRate: percent("Withholding tax on the dividends (default 19%).").optional(),
  annualGrowth: percent("Annual dividend growth.", -100, 100).optional(),
  years: horizon("Projection horizon (0 = first year only).").optional(),
}) satisfies z.ZodType<DividendInput>;
