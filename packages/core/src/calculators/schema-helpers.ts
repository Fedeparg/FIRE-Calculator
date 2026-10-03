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

export const frequency = z
  .enum(FREQUENCIES)
  .optional()
  .describe("Frecuencia de las aportaciones (por defecto monthly).");

export const compounding = z
  .enum(COMPOUNDING_FREQUENCIES)
  .optional()
  .describe(
    "Capitalización de los intereses, independiente de la frecuencia de aportación (por defecto annual). " +
      "Con annual, annualRate es la rentabilidad anual efectiva; con otra, es un tipo nominal anual (TIN) que capitaliza ese número de veces al año.",
  );

export const region = z
  .enum(REGION_CODES)
  .optional()
  .describe(
    "Comunidad autónoma (régimen común). Sin valor se aplica la escala autonómica supletoria. " +
      "País Vasco, Navarra y Ceuta/Melilla no están soportados.",
  );

/** Personal circumstances for IRPF, shared by payroll withholding, net salary and self-employed. */
export const personalCircumstances = {
  age: count("Edad del contribuyente (afecta al mínimo personal).", 120).optional(),
  contractType: z.enum(CONTRACT_TYPES).optional().describe("Tipo de contrato (cambia la cotización por desempleo)."),
  children: count("Hijos o descendientes a cargo.", 20).optional(),
  childrenUnder3: count("De esos hijos, cuántos tienen menos de 3 años.", 20).optional(),
  ascendants: count("Ascendientes mayores de 65 años a cargo.", 10).optional(),
  disability: z
    .enum(DISABILITY_GRADES)
    .optional()
    .describe("Grado de discapacidad del contribuyente: none, g33 (≥33 %) o g65 (≥65 %)."),
  jointReturn: z.boolean().optional().describe("Tributación conjunta (unidad familiar)."),
  region,
};
