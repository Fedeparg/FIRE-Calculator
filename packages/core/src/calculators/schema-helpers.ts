// Shared building blocks for the calculators' zod schemas (`*.schema.ts`). Only the server (MCP)
// uses them: the frontend must NOT import them, to keep zod out of the Next bundle (an ESLint rule
// enforces this). The caps are generous for any real case and reject absurd inputs (€1e300,
// 10,000 years) whose only effect would be to make the server do pointless work.

import { z } from "zod";

import { CONTRACT_TYPES, DISABILITY_GRADES } from "../fiscal/irpf.js";
import { REGION_CODES } from "../fiscal/regions.js";
import { MAX_HORIZON_YEARS } from "../inputs.js";
import { COMPOUNDING_FREQUENCIES, FREQUENCIES } from "../projection.js";

const MAX_AMOUNT = 1e12;

export const amount = (description: string) => z.number().min(0).max(MAX_AMOUNT).describe(description);
export const percent = (description: string, min = 0, max = 100) => z.number().min(min).max(max).describe(description);
/** Default cap for term fields; fields that need a different one pass it as `max`. */
export const horizon = (description: string, max = MAX_HORIZON_YEARS) =>
  z.number().min(0).max(max).describe(description);
export const count = (description: string, max: number) => z.number().int().min(0).max(max).describe(description);

export const frequency = z.enum(FREQUENCIES).optional().describe("Contribution frequency (default monthly).");

export const compounding = z
  .enum(COMPOUNDING_FREQUENCIES)
  .optional()
  .describe(
    "How often interest compounds, independent of the contribution frequency (default annual). " +
      "With annual, annualRate is the effective annual return; with any other value, it is a nominal annual rate (TIN) compounded that many times a year.",
  );

export const region = z
  .enum(REGION_CODES)
  .optional()
  .describe(
    "Autonomous community (comunidad autónoma, common regime). Without a value, the default regional scale (escala autonómica supletoria) applies. " +
      "The Basque Country, Navarre and Ceuta/Melilla are not supported.",
  );

/** Personal circumstances for IRPF, shared by payroll withholding, net salary and self-employed. */
export const personalCircumstances = {
  age: count("Taxpayer's age (affects the personal allowance, mínimo personal).", 120).optional(),
  contractType: z.enum(CONTRACT_TYPES).optional().describe("Contract type (changes the unemployment contribution)."),
  children: count("Dependent children or descendants.", 20).optional(),
  childrenUnder3: count("How many of those children are under 3.", 20).optional(),
  ascendants: count("Dependent ascendants (parents, grandparents) over 65.", 10).optional(),
  disability: z
    .enum(DISABILITY_GRADES)
    .optional()
    .describe("Taxpayer's disability grade: none, g33 (≥33%) or g65 (≥65%)."),
  jointReturn: z.boolean().optional().describe("Joint return (tributación conjunta, family unit)."),
  region,
};
