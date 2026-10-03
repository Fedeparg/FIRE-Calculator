import { describe, expect, it } from 'vitest';

import { instrumentSearchQuerySchema } from './instrument-search-query.dto.js';
import { MAX_PRICE_SYMBOLS, pricesQuerySchema } from './prices-query.dto.js';

describe('pricesQuerySchema', () => {
  it('splits, trims and deduplicates the symbols; none without the parameter', () => {
    expect(pricesQuerySchema.parse({ symbols: ' AAPL, EUNL.DE,,AAPL ' })).toEqual({ symbols: ['AAPL', 'EUNL.DE'] });
    expect(pricesQuerySchema.parse({})).toEqual({ symbols: [] });
  });

  it(`accepts up to ${MAX_PRICE_SYMBOLS} symbols and rejects one more`, () => {
    const symbols = (n: number) => Array.from({ length: n }, (_, i) => `S${i}`).join(',');

    expect(pricesQuerySchema.safeParse({ symbols: symbols(MAX_PRICE_SYMBOLS) }).success).toBe(true);
    expect(pricesQuerySchema.safeParse({ symbols: symbols(MAX_PRICE_SYMBOLS + 1) }).success).toBe(false);
  });

  it('rejects a symbol longer than 20 characters (does not fit in positions.ticker)', () => {
    expect(pricesQuerySchema.safeParse({ symbols: 'X'.repeat(20) }).success).toBe(true);
    expect(pricesQuerySchema.safeParse({ symbols: 'X'.repeat(21) }).success).toBe(false);
  });

  it('rejects unknown parameters', () => {
    expect(pricesQuerySchema.safeParse({ symbols: 'AAPL', extra: '1' }).success).toBe(false);
  });
});

describe('instrumentSearchQuerySchema', () => {
  it('trims the query and caps it at 40 characters', () => {
    expect(instrumentSearchQuerySchema.parse({ q: '  apple  ' })).toEqual({ q: 'apple' });
    expect(instrumentSearchQuerySchema.parse({})).toEqual({ q: '' });
    expect(instrumentSearchQuerySchema.safeParse({ q: 'x'.repeat(41) }).success).toBe(false);
  });
});
