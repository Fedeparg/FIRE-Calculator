import { afterEach, describe, expect, it, vi } from 'vitest';
import { itemAt } from '@sextante/core/arrays';

import {
  epochToUtcDate,
  parseYahooChart,
  parseYahooChartHistory,
  parseYahooDividends,
  parseYahooSplits,
  YahooPriceProvider,
} from './yahoo-price.provider.js';

/** Builds a Yahoo response with the given `meta`. */
const chart = (meta: Record<string, unknown>): unknown => ({ chart: { result: [{ meta }] } });

const VALID_META = {
  symbol: 'EUNL.DE',
  regularMarketPrice: 95.42,
  currency: 'EUR',
  // 2026-03-15T10:30:00Z
  regularMarketTime: 1_773_570_600,
};

describe('epochToUtcDate', () => {
  it('converts an epoch in seconds to YYYY-MM-DD in UTC', () => {
    expect(epochToUtcDate(0)).toBe('1970-01-01');
    expect(epochToUtcDate(1_773_570_600)).toBe('2026-03-15');
  });

  it('uses UTC, not the local zone: a late-night close does not roll over to the next day', () => {
    // 2026-03-15T23:30:00Z — in Madrid it would already be the 16th, but the close date is UTC.
    expect(epochToUtcDate(1_773_617_400)).toBe('2026-03-15');
  });
});

describe('parseYahooChart', () => {
  it('extracts price, currency and date from a valid response', () => {
    expect(parseYahooChart('EUNL.DE', chart(VALID_META))).toEqual({
      symbol: 'EUNL.DE',
      close: 95.42,
      currency: 'EUR',
      date: '2026-03-15',
    });
  });

  it('returns the symbol WE ASKED FOR, not the one Yahoo reports', () => {
    // Yahoo sometimes normalizes the symbol; the cache is keyed by the one we asked for.
    const quote = parseYahooChart('pedido', chart(VALID_META));

    expect(quote?.symbol).toBe('pedido');
  });

  it('falls back to today (UTC) if regularMarketTime is missing', () => {
    const quote = parseYahooChart('EUNL.DE', chart({ symbol: 'EUNL.DE', regularMarketPrice: 95.42, currency: 'EUR' }));

    expect(quote?.date).toBe(new Date().toISOString().slice(0, 10));
  });

  it('accepts a zero price (a security can trade at 0 without it being a parsing error)', () => {
    expect(parseYahooChart('X', chart({ ...VALID_META, regularMarketPrice: 0 }))?.close).toBe(0);
  });

  it.each([
    ['no price', { currency: 'EUR' }],
    ['non-numeric price', { ...VALID_META, regularMarketPrice: '95.42' }],
    ['non-finite price', { ...VALID_META, regularMarketPrice: Number.POSITIVE_INFINITY }],
    ['NaN price', { ...VALID_META, regularMarketPrice: Number.NaN }],
    ['no currency', { regularMarketPrice: 95.42 }],
    ['non-string currency', { ...VALID_META, currency: 42 }],
  ])('returns null with %s', (_label, meta) => {
    expect(parseYahooChart('X', chart(meta))).toBeNull();
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['string', 'boom'],
    ['empty object', {}],
    ['no result', { chart: {} }],
    ['null result (unknown symbol)', { chart: { result: null } }],
    ['empty result', { chart: { result: [] } }],
    ['result without meta', { chart: { result: [{}] } }],
    ['Yahoo error', { chart: { result: null, error: { code: 'Not Found' } } }],
  ])('returns null for a malformed response: %s', (_label, body) => {
    expect(parseYahooChart('X', body)).toBeNull();
  });
});

/** Builds a `chart` response with a time series (`timestamp` + `close` aligned). */
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

/** 2026-03-13, 2026-03-14 and 2026-03-15 (noon UTC of each day). */
const DAY_1 = 1_773_403_200;
const DAY_2 = 1_773_489_600;
const DAY_3 = 1_773_576_000;

describe('parseYahooChartHistory', () => {
  it('turns the series into one quote per day, oldest to newest', () => {
    expect(parseYahooChartHistory('EUNL.DE', series([DAY_1, DAY_2], [95.1, 96.2]))).toEqual([
      { symbol: 'EUNL.DE', close: 95.1, currency: 'EUR', date: '2026-03-13' },
      { symbol: 'EUNL.DE', close: 96.2, currency: 'EUR', date: '2026-03-14' },
    ]);
  });

  it('sorts chronologically even if the source returns the bars reversed', () => {
    const dates = parseYahooChartHistory('X', series([DAY_3, DAY_1], [3, 1])).map((q) => q.date);

    expect(dates).toEqual(['2026-03-13', '2026-03-15']);
  });

  it('SKIPS days without a close (null) instead of turning them into a fake 0', () => {
    const quotes = parseYahooChartHistory('X', series([DAY_1, DAY_2, DAY_3], [95.1, null, 96.5]));

    expect(quotes.map((q) => q.date)).toEqual(['2026-03-13', '2026-03-15']);
    expect(quotes.every((q) => q.close > 0)).toBe(true);
  });

  it('ignores non-numeric or non-finite closes', () => {
    const quotes = parseYahooChartHistory('X', series([DAY_1, DAY_2, DAY_3], ['95.1', Number.NaN, 96.5]));

    expect(quotes).toHaveLength(1);
    expect(itemAt(quotes, 0).close).toBe(96.5);
  });

  it('keeps the last bar if two fall on the same UTC day', () => {
    const quotes = parseYahooChartHistory('X', series([DAY_1, DAY_1 + 3_600], [95.1, 95.9]));

    expect(quotes).toEqual([{ symbol: 'X', close: 95.9, currency: 'EUR', date: '2026-03-13' }]);
  });

  it('uses the symbol WE ASKED FOR and the meta currency for the whole series', () => {
    const quotes = parseYahooChartHistory('pedido', series([DAY_1, DAY_2], [1, 2], 'USD'));

    expect(quotes.every((q) => q.symbol === 'pedido' && q.currency === 'USD')).toBe(true);
  });

  it.each([
    ['null', null],
    ['empty object', {}],
    ['no result', { chart: {} }],
    ['null result (unknown symbol)', { chart: { result: null } }],
    ['no currency', series([DAY_1], [1], null)],
    ['no timestamps', { chart: { result: [{ meta: { currency: 'EUR' } }] } }],
    ['no closes', { chart: { result: [{ meta: { currency: 'EUR' }, timestamp: [DAY_1] }] } }],
  ])('returns [] for an unusable response: %s', (_label, body) => {
    expect(parseYahooChartHistory('X', body)).toEqual([]);
  });
});

describe('YahooPriceProvider.getHistory', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requests 5 years of daily closes in ONE single call', async () => {
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
    // Splits and dividends come in the same call.
    expect(url).toContain('events=div%7Csplit');
    expect(history.quotes).toEqual([{ symbol: 'IWDA.AS', close: 95.4, currency: 'EUR', date: '2026-03-15' }]);
    expect(history.splits).toEqual([]);
  });
});

describe('YahooPriceProvider.getQuotes — Yahoo down', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** Provider without pauses or waits between retries (2 attempts per symbol). */
  function fastProvider(): YahooPriceProvider {
    const provider = new YahooPriceProvider();
    provider.requestDelayMs = 0;
    provider.retry = { ...provider.retry, max: 2, baseMs: 0 };
    return provider;
  }
  const symbols = Array.from({ length: 12 }, (_, i) => `S${i}`);
  const symbolOf = (url: string): string => itemAt(itemAt(url.split('/chart/'), 1).split('?'), 0);

  it('cuts the batch after 5 consecutive symbols with the source down (network or 5xx)', async () => {
    const fetchMock = vi.fn((url: string) =>
      symbolOf(url) === 'S0'
        ? Promise.reject(new TypeError('fetch failed'))
        : Promise.resolve(new Response('', { status: 503 })),
    );
    vi.stubGlobal('fetch', fetchMock);

    const quotes = await fastProvider().getQuotes(symbols);

    expect(quotes.size).toBe(0);
    const asked = new Set(fetchMock.mock.calls.map(([url]) => symbolOf(url)));
    expect([...asked]).toEqual(['S0', 'S1', 'S2', 'S3', 'S4']);
  });

  it('a bad symbol (404) does not count as an outage and resets the count', async () => {
    const fetchMock = vi.fn((url: string) => {
      const symbol = symbolOf(url);
      if (symbol === 'S3') return Promise.resolve(new Response('', { status: 404 }));
      if (symbol === 'S9') return Promise.resolve(Response.json(chart({ ...VALID_META, symbol: 'S9' })));
      return Promise.resolve(new Response('', { status: 500 }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const quotes = await fastProvider().getQuotes(symbols);

    // S0–S2 down, S3 bad (resets), S4–S8 down: cuts after S8 and never reaches S9.
    const asked = new Set(fetchMock.mock.calls.map(([url]) => symbolOf(url)));
    expect(asked.has('S8')).toBe(true);
    expect(asked.has('S9')).toBe(false);
    expect(quotes.size).toBe(0);
  });

  it('with a hanging provider, the batch budget cuts the wait short', async () => {
    const fetchMock = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(init.signal?.reason as Error));
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const provider = fastProvider();
    provider.batchBudgetMs = 50;

    const started = Date.now();
    const quotes = await provider.getQuotes(symbols);

    expect(quotes.size).toBe(0);
    // Without a budget it would wait 12 s per attempt (each request's timeout) and symbol.
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns the quotes when the source is healthy', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => Promise.resolve(Response.json(chart({ ...VALID_META, symbol: symbolOf(url) })))),
    );

    const quotes = await fastProvider().getQuotes(['A', 'B']);

    expect([...quotes.keys()]).toEqual(['A', 'B']);
  });
});

describe('parseYahooSplits', () => {
  const body = (splits: unknown): unknown => ({ chart: { result: [{ events: { splits } }] } });

  it('extracts the splits with their ratio and UTC date, sorted', () => {
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
    ['no events', {}],
    ['no splits', { chart: { result: [{ events: {} }] } }],
    ['zero ratio', body({ a: { date: 1_718_026_200, numerator: 0, denominator: 1 } })],
    ['non-numeric denominator', body({ a: { date: 1_718_026_200, numerator: 2, denominator: '1' } })],
    ['no date', body({ a: { numerator: 2, denominator: 1 } })],
    ['null', null],
  ])('drops unusable input: %s', (_label, input) => {
    expect(parseYahooSplits('X', input)).toEqual([]);
  });
});

describe('parseYahooDividends', () => {
  it('reads the per-share dividend with the quote currency, sorted by ex-date', () => {
    const body = {
      chart: {
        result: [
          {
            meta: { currency: 'EUR' },
            events: {
              dividends: {
                '1753689600': { date: 1753689600, amount: 1.6 },
                '1745539200': { date: 1745539200, amount: 1.84 },
              },
            },
          },
        ],
      },
    };
    expect(parseYahooDividends('ASML.AS', body)).toEqual([
      { symbol: 'ASML.AS', exDate: '2025-04-25', amount: 1.84, currency: 'EUR' },
      { symbol: 'ASML.AS', exDate: '2025-07-28', amount: 1.6, currency: 'EUR' },
    ]);
  });

  it('drops non-positive amounts or invalid dates, and returns nothing without a currency', () => {
    const events = {
      dividends: { a: { date: 1753689600, amount: 0 }, b: { date: 'x', amount: 1 }, c: { date: 1753689600 } },
    };
    expect(parseYahooDividends('X', { chart: { result: [{ meta: { currency: 'EUR' }, events }] } })).toEqual([]);
    expect(
      parseYahooDividends('X', {
        chart: { result: [{ meta: {}, events: { dividends: { a: { date: 1, amount: 1 } } } }] },
      }),
    ).toEqual([]);
    expect(parseYahooDividends('X', null)).toEqual([]);
  });
});
