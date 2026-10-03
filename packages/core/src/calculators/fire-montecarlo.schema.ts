import { z } from "zod";

import {
  DEFAULT_PATHS,
  MAX_RETIREMENT_YEARS,
  MAX_VOLATILITY,
  type MonteCarloInput,
  type MonteCarloOptions,
} from "./fire-montecarlo.js";
import { amount, horizon, percent } from "./schema-helpers.js";

/**
 * Flat MCP input: `historicalStockShare` replaces the core's `returnModel` (a discriminated union,
 * awkward for a client) and `paths`/`seed` are the simulation options.
 */
export const monteCarloSchema = z.strictObject({
  annualExpenses: amount("Gasto anual deseado una vez retirado."),
  currentSavings: amount("Patrimonio invertido actual."),
  monthlySavings: amount("Ahorro mensual hasta alcanzar FIRE."),
  annualReturn: percent("Rentabilidad anual REAL media (modelo lognormal).", -99, 100),
  volatility: percent("Volatilidad anual (desviación típica).", 0, MAX_VOLATILITY),
  withdrawalRate: percent("Tasa de retiro segura (habitual: 4)."),
  retirementYears: horizon("Años que el patrimonio debe sostener el gasto una vez retirado.", MAX_RETIREMENT_YEARS),
  historicalStockShare: percent(
    "Si se indica, usa rentabilidades históricas con este % en bolsa (el resto, bonos) " +
      "en lugar del modelo lognormal; annualReturn y volatility se ignoran.",
  ).optional(),
  paths: z
    .number()
    .int()
    .min(100)
    .max(10_000)
    .optional()
    .describe(`Número de vidas simuladas (por defecto ${DEFAULT_PATHS}).`),
  seed: z.number().int().optional().describe("Semilla del generador aleatorio."),
  includeSensitivity: z
    .boolean()
    .optional()
    .describe("Añade la probabilidad de éxito con tasas de retiro del 3 % al 5 %."),
}) satisfies z.ZodType<Omit<MonteCarloInput, "returnModel"> & MonteCarloOptions>;
