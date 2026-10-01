import { describe, expect, it } from 'vitest';

import { SAMPLES } from './calculator-samples.js';
import { listCalculators, runCalculator } from './calculator-tools.js';

/**
 * Caracterización de la superficie MCP de las calculadoras: el catálogo de `list_calculators`
 * (JSON Schema de cada una) y el resultado de `calculate` con la muestra de cada slug. Es el
 * contrato que ven los clientes: refactorizar dónde viven los esquemas no debe moverlo ni un byte.
 * Si el cambio es intencionado, regenera con `vitest -u`.
 */
describe('superficie MCP de las calculadoras', () => {
  it('el catálogo (list_calculators) no cambia', async () => {
    await expect(JSON.stringify(listCalculators(), null, 2)).toMatchFileSnapshot(
      './__snapshots__/list-calculators.json',
    );
  });

  it('el resultado de calculate con la muestra de cada slug no cambia', async () => {
    const results = Object.fromEntries(Object.keys(SAMPLES).map((slug) => [slug, runCalculator(slug, SAMPLES[slug])]));
    await expect(JSON.stringify(results, null, 2)).toMatchFileSnapshot('./__snapshots__/calculate-results.json');
  });
});
