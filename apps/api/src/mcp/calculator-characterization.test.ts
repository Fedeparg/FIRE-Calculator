import { describe, expect, it } from 'vitest';

import { SAMPLES } from './calculator-samples.js';
import { listCalculators, runCalculator } from './calculator-tools.js';

/**
 * Characterisation of the calculators' MCP surface: the `list_calculators` catalogue (each one's
 * JSON Schema) and the `calculate` result for each slug's sample. It is the contract clients see:
 * refactoring where the schemas live must not move it by a single byte. If the change is
 * intentional, regenerate with `vitest -u`. Results are rounded to 10 significant digits:
 * `Math.pow`/`Math.exp` may differ in the last bit across platforms (macOS ARM versus CI's Linux
 * x64) without the computation changing.
 */
const roundFloats = (_key: string, v: unknown): unknown =>
  typeof v === 'number' && Number.isFinite(v) ? Number(v.toPrecision(10)) : v;

describe('calculators MCP surface', () => {
  it('the catalogue (list_calculators) does not change', async () => {
    await expect(JSON.stringify(listCalculators(), null, 2)).toMatchFileSnapshot(
      './__snapshots__/list-calculators.json',
    );
  });

  it('the calculate result for each slug sample does not change', async () => {
    const results = Object.fromEntries(Object.keys(SAMPLES).map((slug) => [slug, runCalculator(slug, SAMPLES[slug])]));
    await expect(JSON.stringify(results, roundFloats, 2)).toMatchFileSnapshot('./__snapshots__/calculate-results.json');
  });
});
