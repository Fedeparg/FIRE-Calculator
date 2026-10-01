// Bloques comunes de los esquemas zod de las calculadoras (`*.schema.ts`). Solo los usa el
// servidor (MCP): el frontend NO debe importarlos, para no meter zod en el bundle de Next (lo
// impide una regla de ESLint). Los topes son holgados para cualquier caso real y evitan entradas
// absurdas (1e300 €, 10.000 años) que solo sirven para hacer trabajar al servidor.

import { z } from "zod";

import { CONTRACT_TYPES, DISABILITY_GRADES } from "../fiscal/irpf.js";
import { REGION_CODES, type RegionCode } from "../fiscal/regions.js";
import { MAX_HORIZON_YEARS } from "../inputs.js";
import { FREQUENCIES, type Frequency } from "../projection.js";

const MAX_AMOUNT = 1e12;

export const amount = (description: string) => z.number().min(0).max(MAX_AMOUNT).describe(description);
export const percent = (description: string, min = 0, max = 100) => z.number().min(min).max(max).describe(description);
/** Tope por defecto de los campos de plazo; los que necesitan otro lo pasan como `max`. */
export const horizon = (description: string, max = MAX_HORIZON_YEARS) =>
  z.number().min(0).max(max).describe(description);
export const count = (description: string, max: number) => z.number().int().min(0).max(max).describe(description);

export const frequency = z
  .enum(FREQUENCIES as [Frequency, ...Frequency[]])
  .optional()
  .describe("Frecuencia de las aportaciones (por defecto monthly).");

export const region = z
  .enum(REGION_CODES as [RegionCode, ...RegionCode[]])
  .optional()
  .describe(
    "Comunidad autónoma (régimen común). Sin valor se aplica la escala autonómica supletoria. " +
      "País Vasco, Navarra y Ceuta/Melilla no están soportados.",
  );

/** Circunstancias personales del IRPF, comunes a nómina, salario neto y autónomos. */
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
