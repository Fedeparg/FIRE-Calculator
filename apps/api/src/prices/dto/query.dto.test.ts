import { describe, expect, it } from 'vitest';

import { instrumentSearchQuerySchema } from './instrument-search-query.dto.js';
import { MAX_PRICE_SYMBOLS, pricesQuerySchema } from './prices-query.dto.js';

describe('pricesQuerySchema', () => {
  it('parte, limpia y deduplica los símbolos; sin parámetro, ninguno', () => {
    expect(pricesQuerySchema.parse({ symbols: ' AAPL, EUNL.DE,,AAPL ' })).toEqual({ symbols: ['AAPL', 'EUNL.DE'] });
    expect(pricesQuerySchema.parse({})).toEqual({ symbols: [] });
  });

  it(`acepta hasta ${MAX_PRICE_SYMBOLS} símbolos y rechaza uno más`, () => {
    const symbols = (n: number) => Array.from({ length: n }, (_, i) => `S${i}`).join(',');

    expect(pricesQuerySchema.safeParse({ symbols: symbols(MAX_PRICE_SYMBOLS) }).success).toBe(true);
    expect(pricesQuerySchema.safeParse({ symbols: symbols(MAX_PRICE_SYMBOLS + 1) }).success).toBe(false);
  });

  it('rechaza un símbolo de más de 20 caracteres (no cabe en positions.ticker)', () => {
    expect(pricesQuerySchema.safeParse({ symbols: 'X'.repeat(20) }).success).toBe(true);
    expect(pricesQuerySchema.safeParse({ symbols: 'X'.repeat(21) }).success).toBe(false);
  });

  it('rechaza parámetros desconocidos', () => {
    expect(pricesQuerySchema.safeParse({ symbols: 'AAPL', extra: '1' }).success).toBe(false);
  });
});

describe('instrumentSearchQuerySchema', () => {
  it('recorta la consulta y la limita a 40 caracteres', () => {
    expect(instrumentSearchQuerySchema.parse({ q: '  apple  ' })).toEqual({ q: 'apple' });
    expect(instrumentSearchQuerySchema.parse({})).toEqual({ q: '' });
    expect(instrumentSearchQuerySchema.safeParse({ q: 'x'.repeat(41) }).success).toBe(false);
  });
});
