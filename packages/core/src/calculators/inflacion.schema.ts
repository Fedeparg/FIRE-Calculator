import { z } from "zod";

import type { InflationInput } from "./inflacion.js";
import { amount, horizon, percent } from "./schema-helpers.js";

export const inflationSchema = z.strictObject({
  amount: amount("Importe de referencia (hoy)."),
  annualRate: percent("Inflación media anual.", -50, 100),
  years: horizon("Horizonte en años."),
  nominalReturn: percent("Rentabilidad nominal del dinero (0 = parado).", -99, 100).optional(),
}) satisfies z.ZodType<InflationInput>;
