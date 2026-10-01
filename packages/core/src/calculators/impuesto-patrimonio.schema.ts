import { z } from "zod";

import type { WealthTaxInput } from "./impuesto-patrimonio.js";
import { amount, percent } from "./schema-helpers.js";

export const wealthTaxSchema = z.strictObject({
  totalWealth: amount("Patrimonio neto total (bienes y derechos menos deudas)."),
  primaryResidenceValue: amount("Valor de la vivienda habitual (exenta hasta 300.000 €)."),
  exemptMinimum: amount("Mínimo exento (por defecto 700.000 €).").optional(),
  regionalRebate: percent("Bonificación autonómica sobre la cuota.").optional(),
}) satisfies z.ZodType<WealthTaxInput>;
