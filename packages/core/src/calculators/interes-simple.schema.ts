import { z } from "zod";

import type { SimpleInterestInput } from "./interes-simple.js";
import { amount, horizon, percent } from "./schema-helpers.js";

export const simpleInterestSchema = z.strictObject({
  principal: amount("Capital inicial."),
  annualRate: percent("Tipo de interés anual (TIN)."),
  years: horizon("Plazo en años."),
  withholdingRate: percent("Retención sobre los intereses (por defecto 19 %).").optional(),
}) satisfies z.ZodType<SimpleInterestInput>;
