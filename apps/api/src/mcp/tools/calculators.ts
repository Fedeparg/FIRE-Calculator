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
      title: 'Calculadoras disponibles',
      description:
        'Lista las calculadoras de Sextante con su slug, categoría, descripción y el esquema ' +
        'de entrada (JSON Schema con unidades, mínimos y máximos de cada campo). Úsala antes ' +
        'de `calculate` para saber qué calculadora usar y qué `inputs` enviarle. Filtra por ' +
        '`category` o `slug`: sin filtro devuelve todas (unos 40 KB). Solo lectura.',
      inputSchema: {
        category: z.enum(CALCULATOR_CATEGORIES).optional().describe('Solo las de esta categoría.'),
        slug: z.string().max(64).optional().describe('Solo la de este slug.'),
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
      title: 'Ejecutar una calculadora',
      description:
        'Ejecuta una calculadora de Sextante con el mismo motor que la web. `calculator` es el ' +
        'slug (ver `list_calculators`) e `inputs` un objeto que cumple el esquema de esa ' +
        'calculadora: un campo fuera de rango, de otro tipo o desconocido devuelve un error ' +
        'sin calcular. Los importes van en la divisa del usuario (las fiscales, en euros) y ' +
        'los porcentajes en base 100 (5 = 5 %). Solo cálculo, sin leer datos del usuario; es ' +
        'una estimación orientativa, no asesoramiento. Solo lectura.',
      inputSchema: {
        calculator: z.string().max(64).describe('Slug de la calculadora (p. ej. hipoteca-fija).'),
        inputs: z.record(z.string(), z.unknown()).describe('Entradas de la calculadora, según su esquema.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ calculator, inputs }) =>
      runner.run(hasCalculator(calculator) ? `calculate:${calculator}` : 'calculate', () =>
        Promise.resolve(jsonResult(runCalculator(calculator, inputs))),
      ),
  );
}
