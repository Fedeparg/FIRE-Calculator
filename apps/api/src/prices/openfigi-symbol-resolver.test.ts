import { describe, expect, it } from 'vitest';

import { CRYPTO_TICKERS, isinCandidates, tickerCandidates } from './openfigi-symbol-resolver';

/** Tope de candidatos que aplica el resolver (`MAX_CANDIDATES`). */
const MAX_CANDIDATES = 12;

describe('isinCandidates', () => {
  it('prioriza los sufijos europeos y deja el ticker bare al final', () => {
    expect(isinCandidates(['EUNL'])).toEqual([
      'EUNL.AS',
      'EUNL.DE',
      'EUNL.MI',
      'EUNL.PA',
      'EUNL.MC',
      'EUNL.SW',
      'EUNL.L',
      'EUNL',
    ]);
  });

  it('normaliza a mayúsculas y quita espacios', () => {
    expect(isinCandidates([' eunl '])[0]).toBe('EUNL.AS');
  });

  it('ordena los tickers por frecuencia (el listado principal repite el suyo)', () => {
    // "RARO" aparece una vez; "EUNL", tres → EUNL debe ir primero en cada sufijo.
    const candidates = isinCandidates(['RARO', 'EUNL', 'EUNL', 'EUNL']);

    expect(candidates[0]).toBe('EUNL.AS');
    expect(candidates[1]).toBe('RARO.AS');
  });

  it('se queda solo con los 3 tickers más frecuentes', () => {
    const candidates = isinCandidates(['A', 'A', 'B', 'B', 'C', 'C', 'D']);

    expect(candidates.some((c) => c.startsWith('D'))).toBe(false);
  });

  it('acota el número de candidatos y no repite ninguno', () => {
    const candidates = isinCandidates(['A', 'A', 'B', 'B', 'C']);

    expect(candidates).toHaveLength(MAX_CANDIDATES);
    expect(new Set(candidates).size).toBe(candidates.length);
  });

  it('devuelve lista vacía sin tickers (o solo con basura)', () => {
    expect(isinCandidates([])).toEqual([]);
    expect(isinCandidates(['', '   '])).toEqual([]);
  });
});

describe('tickerCandidates', () => {
  it('prueba el bare primero y luego los sufijos de mercado', () => {
    expect(tickerCandidates('SAN')).toEqual([
      'SAN',
      'SAN.AS',
      'SAN.DE',
      'SAN.MI',
      'SAN.PA',
      'SAN.MC',
      'SAN.SW',
      'SAN.L',
    ]);
  });

  it('no inventa sufijos si ya parece un símbolo de Yahoo', () => {
    expect(tickerCandidates('EUNL.DE')).toEqual(['EUNL.DE']);
    expect(tickerCandidates('BTC-USD')).toEqual(['BTC-USD']);
  });

  it('fuerza el par -USD en cripto conocida y NO cae al bare', () => {
    // "BTC" suelto cotiza como un ETF real: resolverlo al bare daría un precio erróneo.
    expect(tickerCandidates('BTC')).toEqual(['BTC-USD']);
    expect(tickerCandidates('ETH')).toEqual(['ETH-USD']);
  });

  it('cubre todas las criptos de la lista con el mismo criterio', () => {
    for (const ticker of CRYPTO_TICKERS) {
      expect(tickerCandidates(ticker)).toEqual([`${ticker}-USD`]);
    }
  });

  it('nunca devuelve más candidatos que el tope', () => {
    expect(tickerCandidates('AAPL').length).toBeLessThanOrEqual(MAX_CANDIDATES);
  });
});
