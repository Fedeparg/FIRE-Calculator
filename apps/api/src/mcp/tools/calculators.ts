import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CALCULATOR_CATEGORIES } from '@sextante/core/calculators/categories';
import { z } from 'zod';

import { hasCalculator, listCalculators, runCalculator } from '../calculator-tools.js';
import { jsonResult } from '../mcp-results.js';
import type { ToolRunner } from './tool-runner.js';

/**
 * Calculators: two generic tools over the `calculator-tools.ts` registry. They are pure (no user
 * data) and read-only. Each run is audited as `calculate:<slug>` (only if the slug exists: the
 * column has a fixed length and the client writes the slug).
 */
export function registerCalculatorTools(server: McpServer, runner: ToolRunner): void {
  server.registerTool(
    'list_calculators',
    {
      title: 'Available calculators',
      description:
        'Lists the Sextante calculators with their slug, category, description and input ' +
        'schema (JSON Schema with the units, minimum and maximum of each field). Use it before ' +
        '`calculate` to know which calculator to use and which `inputs` to send. Filter by ' +
        '`category` or `slug`: without a filter it returns all of them (about 40 KB). ' +
        'Read-only.',
      inputSchema: {
        category: z.enum(CALCULATOR_CATEGORIES).optional().describe('Only those in this category.'),
        slug: z.string().max(64).optional().describe('Only the one with this slug.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ category, slug }) =>
      runner.run('list_calculators', () =>
        Promise.resolve(jsonResult(listCalculators({ category, slug }), { compact: true })),
      ),
  );

  server.registerTool(
    'calculate',
    {
      title: 'Run a calculator',
      description:
        'Runs a Sextante calculator with the same engine as the website. `calculator` is the ' +
        "slug (see `list_calculators`) and `inputs` an object that matches that calculator's " +
        'schema: a field that is out of range, of the wrong type or unknown returns an error ' +
        "without computing. Amounts are in the user's currency (the tax calculators, in " +
        'euros) and percentages on a base of 100 (5 = 5%). Computation only, without reading ' +
        'user data; it is an indicative estimate, not advice. Read-only.',
      inputSchema: {
        calculator: z.string().max(64).describe('Calculator slug (e.g. hipoteca-fija).'),
        inputs: z.record(z.string(), z.unknown()).describe('Calculator inputs, following its schema.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ calculator, inputs }) =>
      runner.run(hasCalculator(calculator) ? `calculate:${calculator}` : 'calculate', () =>
        Promise.resolve(jsonResult(runCalculator(calculator, inputs))),
      ),
  );
}
