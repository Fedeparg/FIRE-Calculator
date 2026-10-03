import { z } from 'zod';

import type { CalculatorCategory } from '@sextante/core/calculators/categories';
import { CALCULATORS, type CalculatorEntry } from '@sextante/core/calculators/schemas';

import { ToolUserError } from './tool-errors.js';

/**
 * MCP glue over the `@sextante/core` calculator registry (schema, category and computation of
 * each one): catalogue for `list_calculators` and execution for `calculate`.
 */

/** Calculator whose slug does not exist (turned into a tool error pointing to the valid ones). */
export class UnknownCalculatorError extends ToolUserError {
  constructor(slug: string) {
    super(`Unknown calculator: "${slug}". Use list_calculators to see the available slugs.`);
  }
}

export interface CalculatorListing {
  slug: string;
  category: CalculatorCategory;
  title: string;
  description: string;
  /** JSON Schema of `inputs` (types, minimums, maximums and a description with units for each field). */
  inputSchema: unknown;
}

/** A slug is valid only if it is an own key (rules out `__proto__`, `constructor`, etc.). */
function findCalculator(slug: string): CalculatorEntry | undefined {
  return Object.hasOwn(CALCULATORS, slug) ? CALCULATORS[slug] : undefined;
}

/** JSON Schema of each calculator, derived from zod only once (the schemas are static). */
const listingCache = new Map<string, CalculatorListing>();

function toListing(slug: string, entry: CalculatorEntry): CalculatorListing {
  let listing = listingCache.get(slug);
  if (!listing) {
    const inputSchema = z.toJSONSchema(entry.schema, { io: 'input' });
    delete inputSchema.$schema; // noise: the client already knows the JSON Schema draft
    listing = { slug, category: entry.category, title: entry.title, description: entry.description, inputSchema };
    listingCache.set(slug, listing);
  }
  return listing;
}

/** Catalogue for `list_calculators`: all of them, or those of one category / one slug. */
export function listCalculators(filter: { category?: CalculatorCategory; slug?: string } = {}): CalculatorListing[] {
  return Object.entries(CALCULATORS)
    .filter(
      ([slug, entry]) =>
        (!filter.slug || slug === filter.slug) && (!filter.category || entry.category === filter.category),
    )
    .map(([slug, entry]) => toListing(slug, entry));
}

/** Readable summary of zod validation errors, without dumping the internal JSON. */
function describeIssues(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join('.') || 'inputs'}: ${issue.message}`).join('; ');
}

/**
 * Validates `inputs` against THAT calculator's schema and computes. Throws `UnknownCalculatorError`
 * if the slug does not exist and a `ToolUserError` listing the invalid fields if the input breaks
 * the schema (out of range, wrong type or unknown): in both cases nothing is computed.
 */
export function runCalculator(slug: string, inputs: unknown): unknown {
  const entry = findCalculator(slug);
  if (!entry) throw new UnknownCalculatorError(slug);
  try {
    return entry.run(inputs);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ToolUserError(`Invalid input for ${slug}: ${describeIssues(error)}`);
    }
    throw error;
  }
}

/** Does the calculator exist? So only known slugs are audited (the column has a fixed length). */
export function hasCalculator(slug: string): boolean {
  return findCalculator(slug) !== undefined;
}
