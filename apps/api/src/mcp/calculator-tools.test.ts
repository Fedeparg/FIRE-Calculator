import { describe, expect, it } from 'vitest';

import { computeMortgage } from '@sextante/core/calculators/hipoteca';
import { simulateFire, type MonteCarloInput } from '@sextante/core/calculators/fire-montecarlo';
import { estimateNetSalary } from '@sextante/core/fiscal/irpf';

import { CALCULATORS } from '@sextante/core/calculators/schemas';

import { hasCalculator, listCalculators, runCalculator, UnknownCalculatorError } from './calculator-tools.js';
import { SAMPLES } from './calculator-samples.js';

const slugs = Object.keys(CALCULATORS);

describe('CALCULATORS', () => {
  it('has a sample input for every calculator, and no extra ones', () => {
    expect([...slugs].sort()).toEqual(Object.keys(SAMPLES).sort());
  });

  it.each(slugs)('%s computes with a realistic input and the result serialises', (slug) => {
    const result = runCalculator(slug, SAMPLES[slug]);
    expect(result).toBeTypeOf('object');
    expect(() => JSON.stringify(result)).not.toThrow();
  });

  it.each(slugs)('%s rejects an unknown key instead of ignoring it', (slug) => {
    expect(() => runCalculator(slug, { ...SAMPLES[slug], notAField: 1 })).toThrow(/notAField/);
  });

  it('returns exactly the same as the web calculator', () => {
    const input = { principal: 200_000, annualRate: 3, years: 30 };
    expect(runCalculator('hipoteca-fija', input)).toEqual(computeMortgage(input));

    const salary = { grossAnnual: 35_000, region: 'madrid' as const };
    expect(runCalculator('salario-bruto-neto', salary)).toEqual(estimateNetSalary(salary));
  });

  it('the Monte Carlo is the web one: same seed, same result', () => {
    const input: MonteCarloInput = {
      annualExpenses: 24_000,
      currentSavings: 100_000,
      monthlySavings: 1500,
      annualReturn: 5,
      volatility: 15,
      withdrawalRate: 4,
      retirementYears: 30,
    };
    const options = { paths: 200, seed: 7 };

    expect(runCalculator('simulador-montecarlo', { ...input, ...options })).toEqual(
      simulateFire({ ...input, returnModel: { kind: 'lognormal' } }, options),
    );
    // The historical model's stock share is a 0-100 percentage, as on the web.
    expect(runCalculator('simulador-montecarlo', { ...input, ...options, historicalStockShare: 60 })).toEqual(
      simulateFire({ ...input, returnModel: { kind: 'historical', stockShare: 60 } }, options),
    );
  });

  it('adds the sensitivity table only when asked', () => {
    const sample = SAMPLES['simulador-montecarlo'];
    expect(runCalculator('simulador-montecarlo', sample)).not.toHaveProperty('sensitivity');
    expect(runCalculator('simulador-montecarlo', { ...sample, includeSensitivity: true })).toHaveProperty(
      'sensitivity',
    );
  });

  it('rejects out-of-range inputs before computing', () => {
    const monteCarlo = SAMPLES['simulador-montecarlo'];
    expect(() => runCalculator('simulador-montecarlo', { ...monteCarlo, paths: 1_000_000 })).toThrow(/paths/);
    expect(() => runCalculator('simulador-montecarlo', { ...monteCarlo, retirementYears: 500 })).toThrow();

    const compound = SAMPLES['interes-compuesto'];
    expect(() => runCalculator('interes-compuesto', { ...compound, years: 10_000 })).toThrow();
    expect(() => runCalculator('interes-compuesto', { ...compound, initial: -1 })).toThrow();
    expect(() => runCalculator('interes-compuesto', { ...compound, initial: 'mil' })).toThrow();
    expect(() => runCalculator('interes-compuesto', { initial: 1 })).toThrow(/contribution/);

    expect(() => runCalculator('salario-bruto-neto', { grossAnnual: 30_000, region: 'navarra' })).toThrow();
  });

  it('an unknown slug (or one inherited from Object) is a clear error', () => {
    expect(() => runCalculator('no-existe', {})).toThrow(UnknownCalculatorError);
    expect(() => runCalculator('constructor', {})).toThrow(UnknownCalculatorError);
    expect(() => runCalculator('__proto__', {})).toThrow(UnknownCalculatorError);
    expect(hasCalculator('hipoteca-fija')).toBe(true);
    expect(hasCalculator('toString')).toBe(false);
  });

  it('the credit card summarises the monthly series as each year-end balance and the last month', () => {
    const result = runCalculator('intereses-tarjeta-credito', SAMPLES['intereses-tarjeta-credito']) as {
      monthsToPayoff: number;
      yearlySeries: { month: number }[];
    };
    const months = result.yearlySeries.map((p) => p.month);
    expect(months[0]).toBe(0);
    expect(months.at(-1)).toBe(result.monthsToPayoff);
    expect(months.slice(0, -1).every((m) => m % 12 === 0)).toBe(true);
  });

  it('a debt that is never paid off returns monthsToPayoff null', () => {
    const result = runCalculator('intereses-tarjeta-credito', {
      balance: 10_000,
      annualRate: 30,
      monthlyPayment: 10,
    });
    expect(result).toMatchObject({ monthsToPayoff: null, yearlySeries: [] });
  });

  it('the financial health check scores by option index', () => {
    const best = Object.fromEntries(
      ['emergencyFund', 'savingsRate', 'debt', 'housingCost', 'investing', 'retirement', 'protection', 'tracking'].map(
        (id) => [id, 3],
      ),
    );
    expect(runCalculator('salud-financiera', best)).toEqual({ score: 100, category: 'strong' });
    expect(runCalculator('salud-financiera', {})).toEqual({ score: 0, category: 'critical' });
    expect(() => runCalculator('salud-financiera', { debt: 4 })).toThrow();
  });
});

describe('listCalculators', () => {
  it('lists all of them with their JSON Schema (types, bounds and units)', () => {
    expect(
      listCalculators()
        .map((c) => c.slug)
        .sort(),
    ).toEqual([...slugs].sort());

    const mortgage = listCalculators({ slug: 'hipoteca-fija' })[0];
    expect(mortgage).toMatchObject({ slug: 'hipoteca-fija', category: 'hipoteca' });
    expect(JSON.stringify(mortgage)).not.toContain('$schema');
    const schema = mortgage?.inputSchema as {
      required: string[];
      additionalProperties: boolean;
      properties: Record<string, { minimum?: number; maximum?: number; description?: string }>;
    };
    expect(schema.required).toEqual(['principal', 'annualRate', 'years']);
    expect(schema.additionalProperties).toBe(false);
    expect(schema.properties.annualRate).toMatchObject({ minimum: 0, maximum: 50 });
    expect(schema.properties.annualRate?.description).toContain('TIN');
  });

  it('filters by category and by slug', () => {
    const tax = listCalculators({ category: 'fiscalidad' });
    expect(tax.length).toBeGreaterThan(1);
    expect(tax.every((c) => c.category === 'fiscalidad')).toBe(true);
    expect(listCalculators({ slug: 'no-existe' })).toEqual([]);
  });

  it('deposit and interest-bearing account share a schema', () => {
    const [deposit] = listCalculators({ slug: 'deposito-plazo-fijo' });
    const [account] = listCalculators({ slug: 'cuenta-remunerada' });
    expect(account?.inputSchema).toEqual(deposit?.inputSchema);
  });
});
