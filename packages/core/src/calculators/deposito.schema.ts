import { z } from "zod";

import type { DepositInput } from "./deposito.js";
import { amount, horizon, percent } from "./schema-helpers.js";

export const depositSchema = z.strictObject({
  principal: amount("Capital depositado."),
  apr: percent("TAE.", 0, 50),
  years: horizon("Plazo en años (admite decimales: 0,5 = 6 meses).", 50),
  withholdingRate: percent("Retención sobre los intereses (por defecto 19 %).").optional(),
  inflationRate: percent("Inflación anual estimada.", -50, 100).optional(),
}) satisfies z.ZodType<DepositInput>;
