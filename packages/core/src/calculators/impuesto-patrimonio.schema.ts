import { z } from "zod";

import type { WealthTaxInput } from "./impuesto-patrimonio.js";
import { amount, percent } from "./schema-helpers.js";

export const wealthTaxSchema = z.strictObject({
  totalWealth: amount("Total net wealth (assets and rights minus debts)."),
  primaryResidenceValue: amount("Value of the primary residence (vivienda habitual, exempt up to €300,000)."),
  exemptMinimum: amount("Tax-free allowance (mínimo exento, default €700,000).").optional(),
  regionalRebate: percent("Regional rebate (bonificación autonómica) on the tax due.").optional(),
}) satisfies z.ZodType<WealthTaxInput>;
