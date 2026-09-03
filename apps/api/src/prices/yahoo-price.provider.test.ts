import { describe, expect, it } from 'vitest';

import { epochToUtcDate, parseYahooChart } from './yahoo-price.provider';

/** Construye una respuesta de Yahoo con el `meta` indicado. */
const chart = (meta: Record<string, unknown>): unknown => ({ chart: { result: [{ meta }] } });

const VALID_META = {
  symbol: 'EUNL.DE',
  regularMarketPrice: 95.42,
  currency: 'EUR',
  // 2026-03-15T10:30:00Z
  regularMarketTime: 1_773_570_600,
};

describe('epochToUtcDate', () => {
  it('convierte un epoch en segundos a YYYY-MM-DD en UTC', () => {
    expect(epochToUtcDate(0)).toBe('1970-01-01');
    expect(epochToUtcDate(1_773_570_600)).toBe('2026-03-15');
  });

  it('usa UTC, no la zona local: un cierre nocturno no salta de día', () => {
    // 2026-03-15T23:30:00Z — en Madrid ya sería el 16, pero la fecha del cierre es UTC.
    expect(epochToUtcDate(1_773_617_400)).toBe('2026-03-15');
  });
});

describe('parseYahooChart', () => {
  it('extrae precio, divisa y fecha de una respuesta válida', () => {
    expect(parseYahooChart('EUNL.DE', chart(VALID_META))).toEqual({
      symbol: 'EUNL.DE',
      close: 95.42,
      currency: 'EUR',
      date: '2026-03-15',
    });
  });

  it('devuelve el símbolo QUE PEDIMOS, no el que diga Yahoo', () => {
    // Yahoo a veces normaliza el símbolo; la caché se indexa por el que pedimos nosotros.
    const quote = parseYahooChart('pedido', chart(VALID_META));

    expect(quote?.symbol).toBe('pedido');
  });

  it('cae a la fecha de hoy (UTC) si falta regularMarketTime', () => {
    const quote = parseYahooChart(
      'EUNL.DE',
      chart({ symbol: 'EUNL.DE', regularMarketPrice: 95.42, currency: 'EUR' }),
    );

    expect(quote?.date).toBe(new Date().toISOString().slice(0, 10));
  });

  it('acepta un precio cero (un valor puede cotizar a 0 sin ser un error de parseo)', () => {
    expect(parseYahooChart('X', chart({ ...VALID_META, regularMarketPrice: 0 }))?.close).toBe(0);
  });

  it.each([
    ['sin precio', { currency: 'EUR' }],
    ['precio no numérico', { ...VALID_META, regularMarketPrice: '95.42' }],
    ['precio no finito', { ...VALID_META, regularMarketPrice: Number.POSITIVE_INFINITY }],
    ['precio NaN', { ...VALID_META, regularMarketPrice: Number.NaN }],
    ['sin divisa', { regularMarketPrice: 95.42 }],
    ['divisa no textual', { ...VALID_META, currency: 42 }],
  ])('devuelve null con %s', (_label, meta) => {
    expect(parseYahooChart('X', chart(meta))).toBeNull();
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['cadena', 'boom'],
    ['objeto vacío', {}],
    ['sin result', { chart: {} }],
    ['result null (símbolo inexistente)', { chart: { result: null } }],
    ['result vacío', { chart: { result: [] } }],
    ['result sin meta', { chart: { result: [{}] } }],
    ['error de Yahoo', { chart: { result: null, error: { code: 'Not Found' } } }],
  ])('devuelve null con una respuesta malformada: %s', (_label, body) => {
    expect(parseYahooChart('X', body)).toBeNull();
  });
});
