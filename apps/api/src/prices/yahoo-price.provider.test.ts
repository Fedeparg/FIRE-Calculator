import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  epochToUtcDate,
  parseYahooChart,
  parseYahooChartHistory,
  parseYahooSplits,
  YahooPriceProvider,
} from './yahoo-price.provider.js';

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

/** Construye una respuesta `chart` con serie temporal (`timestamp` + `close` alineados). */
const series = (timestamps: unknown[], closes: unknown[], currency: unknown = 'EUR'): unknown => ({
  chart: {
    result: [
      {
        meta: { symbol: 'EUNL.DE', currency },
        timestamp: timestamps,
        indicators: { quote: [{ close: closes }] },
      },
    ],
  },
});

/** 2026-03-13, 2026-03-14 y 2026-03-15 (mediodía UTC de cada día). */
const DAY_1 = 1_773_403_200;
const DAY_2 = 1_773_489_600;
const DAY_3 = 1_773_576_000;

describe('parseYahooChartHistory', () => {
  it('convierte la serie en una cotización por día, de la más antigua a la más reciente', () => {
    expect(parseYahooChartHistory('EUNL.DE', series([DAY_1, DAY_2], [95.1, 96.2]))).toEqual([
      { symbol: 'EUNL.DE', close: 95.1, currency: 'EUR', date: '2026-03-13' },
      { symbol: 'EUNL.DE', close: 96.2, currency: 'EUR', date: '2026-03-14' },
    ]);
  });

  it('ordena cronológicamente aunque la fuente devuelva las barras al revés', () => {
    const dates = parseYahooChartHistory('X', series([DAY_3, DAY_1], [3, 1])).map((q) => q.date);

    expect(dates).toEqual(['2026-03-13', '2026-03-15']);
  });

  it('SALTA los días sin cierre (null) en vez de convertirlos en un 0 falso', () => {
    const quotes = parseYahooChartHistory('X', series([DAY_1, DAY_2, DAY_3], [95.1, null, 96.5]));

    expect(quotes.map((q) => q.date)).toEqual(['2026-03-13', '2026-03-15']);
    expect(quotes.every((q) => q.close > 0)).toBe(true);
  });

  it('ignora cierres no numéricos o no finitos', () => {
    const quotes = parseYahooChartHistory(
      'X',
      series([DAY_1, DAY_2, DAY_3], ['95.1', Number.NaN, 96.5]),
    );

    expect(quotes).toHaveLength(1);
    expect(quotes[0].close).toBe(96.5);
  });

  it('se queda con la última barra si dos caen el mismo día UTC', () => {
    const quotes = parseYahooChartHistory('X', series([DAY_1, DAY_1 + 3_600], [95.1, 95.9]));

    expect(quotes).toEqual([{ symbol: 'X', close: 95.9, currency: 'EUR', date: '2026-03-13' }]);
  });

  it('usa el símbolo QUE PEDIMOS y la divisa del meta para toda la serie', () => {
    const quotes = parseYahooChartHistory('pedido', series([DAY_1, DAY_2], [1, 2], 'USD'));

    expect(quotes.every((q) => q.symbol === 'pedido' && q.currency === 'USD')).toBe(true);
  });

  it.each([
    ['null', null],
    ['objeto vacío', {}],
    ['sin result', { chart: {} }],
    ['result null (símbolo inexistente)', { chart: { result: null } }],
    ['sin divisa', series([DAY_1], [1], null)],
    ['sin timestamps', { chart: { result: [{ meta: { currency: 'EUR' } }] } }],
    ['sin closes', { chart: { result: [{ meta: { currency: 'EUR' }, timestamp: [DAY_1] }] } }],
  ])('devuelve [] con una respuesta inutilizable: %s', (_label, body) => {
    expect(parseYahooChartHistory('X', body)).toEqual([]);
  });
});

describe('YahooPriceProvider.getHistory', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('pide 5 años de cierres diarios en UNA sola llamada', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        Response.json({
          chart: {
            result: [
              { meta: { currency: 'EUR' }, timestamp: [1_773_570_600], indicators: { quote: [{ close: [95.4] }] } },
            ],
          },
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const history = await new YahooPriceProvider().getHistory('IWDA.AS');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(url).toContain('/IWDA.AS?');
    expect(url).toContain('range=5y');
    expect(url).toContain('interval=1d');
    expect(url).toContain('events=split');
    expect(history.quotes).toEqual([{ symbol: 'IWDA.AS', close: 95.4, currency: 'EUR', date: '2026-03-15' }]);
    expect(history.splits).toEqual([]);
  });
});

describe('parseYahooSplits', () => {
  const body = (splits: unknown): unknown => ({ chart: { result: [{ events: { splits } }] } });

  it('extrae los splits con su ratio y fecha UTC, ordenados', () => {
    expect(
      parseYahooSplits(
        'NVDA',
        body({
          b: { date: 1_718_026_200, numerator: 10, denominator: 1 },
          a: { date: 1_600_000_000, numerator: 1, denominator: 2 },
        }),
      ),
    ).toEqual([
      { symbol: 'NVDA', date: '2020-09-13', ratio: 0.5 },
      { symbol: 'NVDA', date: '2024-06-10', ratio: 10 },
    ]);
  });

  it.each([
    ['sin events', {}],
    ['sin splits', { chart: { result: [{ events: {} }] } }],
    ['ratio cero', body({ a: { date: 1_718_026_200, numerator: 0, denominator: 1 } })],
    ['denominador no numérico', body({ a: { date: 1_718_026_200, numerator: 2, denominator: '1' } })],
    ['sin fecha', body({ a: { numerator: 2, denominator: 1 } })],
    ['null', null],
  ])('descarta lo inutilizable: %s', (_label, input) => {
    expect(parseYahooSplits('X', input)).toEqual([]);
  });
});
