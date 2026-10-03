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
  annualExpenses: amount("Desired annual spending once retired."),
  currentSavings: amount("Current invested wealth."),
  monthlySavings: amount("Monthly savings until reaching FIRE."),
  annualReturn: percent("Average REAL annual return (lognormal model).", -99, 100),
  volatility: percent("Annual volatility (standard deviation).", 0, MAX_VOLATILITY),
  withdrawalRate: percent("Safe withdrawal rate (typically 4)."),
  retirementYears: horizon("Years the portfolio must sustain spending once retired.", MAX_RETIREMENT_YEARS),
  historicalStockShare: percent(
    "If given, uses historical returns with this % in stocks (the rest in bonds) " +
      "instead of the lognormal model; annualReturn and volatility are ignored.",
  ).optional(),
  paths: z
    .number()
    .int()
    .min(100)
    .max(10_000)
    .optional()
    .describe(`Number of simulated lifetimes (default ${DEFAULT_PATHS}).`),
  seed: z.number().int().optional().describe("Random number generator seed."),
  includeSensitivity: z
    .boolean()
    .optional()
    .describe("Adds the probability of success for withdrawal rates from 3% to 5%."),
}) satisfies z.ZodType<Omit<MonteCarloInput, "returnModel"> & MonteCarloOptions>;
