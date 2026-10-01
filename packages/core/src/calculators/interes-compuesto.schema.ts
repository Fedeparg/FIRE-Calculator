import { z } from "zod";

import type { CompoundInput } from "./interes-compuesto.js";
import { amount, compounding, frequency, horizon, percent } from "./schema-helpers.js";

export const compoundSchema = z.strictObject({
  initial: amount("Capital inicial."),
  contribution: amount("Importe de cada aportación."),
  frequency,
  compounding,
  annualRate: percent("Rentabilidad anual esperada.", -99, 100),
  years: horizon("Horizonte en años."),
  annualFee: percent("Comisión anual del producto (TER).").optional(),
  contributionGrowth: percent("Crecimiento anual de la aportación.", -100, 100).optional(),
  inflationRate: percent("Inflación anual estimada, para el valor real.", -50, 100).optional(),
}) satisfies z.ZodType<CompoundInput>;
