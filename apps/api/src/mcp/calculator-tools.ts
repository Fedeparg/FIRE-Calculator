import { z } from 'zod';

import type { CalculatorCategory } from '@sextante/core/calculators/categories';
import { CALCULATORS, type CalculatorEntry } from '@sextante/core/calculators/schemas';

import { ToolUserError } from './tool-errors.js';

/**
 * Pegamento MCP sobre el registro de calculadoras de `@sextante/core` (esquemas, categoría y
 * cálculo de cada una): catálogo para `list_calculators` y ejecución para `calculate`.
 */

/** Calculadora cuyo slug no existe (se traduce a error de tool con la lista de válidos). */
export class UnknownCalculatorError extends ToolUserError {
  constructor(slug: string) {
    super(`Calculadora desconocida: "${slug}". Usa list_calculators para ver los slugs disponibles.`);
  }
}

export interface CalculatorListing {
  slug: string;
  category: CalculatorCategory;
  title: string;
  description: string;
  /** JSON Schema de `inputs` (tipos, mínimos, máximos y descripción con unidades de cada campo). */
  inputSchema: unknown;
}

/** Un slug es válido solo si es una clave propia (evita `__proto__`, `constructor`, etc.). */
function findCalculator(slug: string): CalculatorEntry | undefined {
  return Object.hasOwn(CALCULATORS, slug) ? CALCULATORS[slug] : undefined;
}

/** Esquema JSON de cada calculadora, derivado del zod una sola vez (los esquemas son estáticos). */
const listingCache = new Map<string, CalculatorListing>();

function toListing(slug: string, entry: CalculatorEntry): CalculatorListing {
  let listing = listingCache.get(slug);
  if (!listing) {
    const inputSchema = z.toJSONSchema(entry.schema, { io: 'input' });
    delete inputSchema.$schema; // ruido: el borrador de JSON Schema ya lo sabe el cliente
    listing = { slug, category: entry.category, title: entry.title, description: entry.description, inputSchema };
    listingCache.set(slug, listing);
  }
  return listing;
}

/** Catálogo para `list_calculators`: todas, o las de una categoría / un slug. */
export function listCalculators(filter: { category?: CalculatorCategory; slug?: string } = {}): CalculatorListing[] {
  return Object.entries(CALCULATORS)
    .filter(
      ([slug, entry]) =>
        (!filter.slug || slug === filter.slug) && (!filter.category || entry.category === filter.category),
    )
    .map(([slug, entry]) => toListing(slug, entry));
}

/** Resumen legible de los errores de validación de zod, sin volcar el JSON interno. */
function describeIssues(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join('.') || 'inputs'}: ${issue.message}`).join('; ');
}

/**
 * Valida `inputs` con el esquema de ESA calculadora y calcula. Lanza `UnknownCalculatorError` si
 * el slug no existe y un `ToolUserError` con los campos inválidos si la entrada no cumple el esquema
 * (fuera de rango, de otro tipo o desconocida): en ambos casos no se calcula nada.
 */
export function runCalculator(slug: string, inputs: unknown): unknown {
  const entry = findCalculator(slug);
  if (!entry) throw new UnknownCalculatorError(slug);
  try {
    return entry.run(inputs);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ToolUserError(`Entrada no válida para ${slug}: ${describeIssues(error)}`);
    }
    throw error;
  }
}

/** ¿Existe la calculadora? Para auditar solo slugs conocidos (la columna es de longitud fija). */
export function hasCalculator(slug: string): boolean {
  return findCalculator(slug) !== undefined;
}
