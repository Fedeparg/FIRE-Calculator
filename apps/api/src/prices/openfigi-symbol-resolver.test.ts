import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { Database } from '../db/database.module.js';
import { instruments } from '../db/schema.js';
import { fakeConfig } from '../../test/config.js';
import { createTestDb, resetDb } from '../../test/db.js';
import type { InstrumentSearchResult } from './instrument-search.js';
import {
  CRYPTO_TICKERS,
  isinCandidates,
  type OpenFigiListing,
  OpenFigiSymbolResolver,
  searchCandidates,
  tickerCandidates,
} from './openfigi-symbol-resolver.js';
import type { PriceProvider, Quote } from './price-provider.interface.js';
import { stub } from '../../test/factories.js';

/** Candidate cap the resolver applies (`MAX_CANDIDATES`). */
const MAX_CANDIDATES = 12;

/**
 * Real OpenFIGI listings for Amazon (US0231351067), trimmed: Yahoo search failed and the fallback
 * tried "AMZN" with European suffixes, and `AMZN.AS` is an ETP on Amazon (~€7).
 */
const AMAZON_LISTINGS: OpenFigiListing[] = [
  { exchCode: 'US', ticker: 'AMZN' },
  { exchCode: 'UW', ticker: 'AMZN' },
  { exchCode: 'GR', ticker: 'AMZ' },
  { exchCode: 'GY', ticker: 'AMZ' },
  { exchCode: 'GF', ticker: 'AMZ' },
  { exchCode: 'SW', ticker: 'AMZN' },
  { exchCode: 'SE', ticker: 'AMZN' },
  { exchCode: 'SW', ticker: 'AMZNUSD' },
  { exchCode: 'IM', ticker: '1AMZN' },
  { exchCode: 'LN', ticker: '0R1O' },
  { exchCode: 'EO', ticker: 'AMZNEUR' },
  { exchCode: 'EU', ticker: 'AMZNEUR' },
  { exchCode: 'XH', ticker: 'AMZNEUR' },
  { exchCode: 'MM', ticker: 'AMZN*' },
];

describe('isinCandidates', () => {
  it('tries each ticker only with its exchange suffix, EUR first and US last', () => {
    expect(isinCandidates(AMAZON_LISTINGS)).toEqual(['AMZ.DE', '1AMZN.MI', 'AMZN.SW', 'AMZNUSD.SW', '0R1O.L', 'AMZN']);
  });

  it('does not invent a listing OpenFIGI does not have (AMZN.AS is another product)', () => {
    expect(isinCandidates(AMAZON_LISTINGS)).not.toContain('AMZN.AS');
  });

  it('ignores composites and codes without a Yahoo exchange', () => {
    expect(isinCandidates([{ exchCode: 'EO', ticker: 'X' }, { exchCode: 'XH', ticker: 'X' }, { ticker: 'X' }])).toEqual(
      [],
    );
  });

  it('uppercases and trims whitespace', () => {
    expect(isinCandidates([{ exchCode: ' na ', ticker: ' iwda ' }])).toEqual(['IWDA.AS']);
  });

  it('prefers the most repeated ticker within the same suffix', () => {
    const candidates = isinCandidates([
      { exchCode: 'GY', ticker: 'RARO' },
      { exchCode: 'GY', ticker: 'EUNL' },
      { exchCode: 'GR', ticker: 'EUNL' },
    ]);

    expect(candidates).toEqual(['EUNL.DE', 'RARO.DE']);
  });

  it('caps the number of candidates and repeats none', () => {
    const listings = Array.from({ length: MAX_CANDIDATES + 5 }, (_, i) => ({ exchCode: 'GY', ticker: `T${i}` }));
    const candidates = isinCandidates([...listings, ...listings]);

    expect(candidates).toHaveLength(MAX_CANDIDATES);
    expect(new Set(candidates).size).toBe(candidates.length);
  });

  it('returns an empty list with no listings (or only junk)', () => {
    expect(isinCandidates([])).toEqual([]);
    expect(isinCandidates([{ exchCode: 'GY', ticker: '   ' }])).toEqual([]);
  });
});

describe('tickerCandidates', () => {
  it('tries the bare ticker first and then the market suffixes', () => {
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

  it('does not invent suffixes if it already looks like a Yahoo symbol', () => {
    expect(tickerCandidates('EUNL.DE')).toEqual(['EUNL.DE']);
    expect(tickerCandidates('BTC-USD')).toEqual(['BTC-USD']);
  });

  it('forces the -USD pair for known crypto and does NOT fall back to the bare ticker', () => {
    // Bare "BTC" is quoted as a real ETF: resolving to the bare ticker would give a wrong price.
    expect(tickerCandidates('BTC')).toEqual(['BTC-USD']);
    expect(tickerCandidates('ETH')).toEqual(['ETH-USD']);
  });

  it('applies the same rule to every crypto in the list', () => {
    for (const ticker of CRYPTO_TICKERS) {
      expect(tickerCandidates(ticker)).toEqual([`${ticker}-USD`]);
    }
  });

  it('never returns more candidates than the cap', () => {
    expect(tickerCandidates('AAPL').length).toBeLessThanOrEqual(MAX_CANDIDATES);
  });
});

const result = (symbol: string, type: InstrumentSearchResult['type'] = 'etf'): InstrumentSearchResult => ({
  symbol,
  name: symbol,
  type,
  exchange: null,
});

describe('searchCandidates', () => {
  it('prefers euro markets and keeps the rest in Yahoo order', () => {
    expect(
      searchCandidates([result('VAPU.L'), result('IE00BK5BQZ41.SG', 'fund'), result('VWCE.DE'), result('VWCE.AS')]),
    ).toEqual(['VWCE.AS', 'VWCE.DE', 'VAPU.L', 'IE00BK5BQZ41.SG']);
  });

  it('accepts non-European securities (Hong Kong) when that is all there is', () => {
    expect(searchCandidates([result('1810.HK', 'equity')])).toEqual(['1810.HK']);
  });

  it('drops what cannot be an ISIN instrument and repeats none', () => {
    expect(
      searchCandidates([
        result('^GSPC', 'index'),
        result('EURUSD=X', 'currency'),
        result('aapl', 'equity'),
        result('AAPL', 'equity'),
      ]),
    ).toEqual(['AAPL']);
  });

  it('caps the number of candidates to validate', () => {
    expect(searchCandidates(Array.from({ length: 20 }, (_, i) => result(`X${i}.PA`)))).toHaveLength(5);
  });
});

describe('OpenFigiSymbolResolver.resolve (ISIN)', () => {
  const ISIN = 'IE00BK5BQZ41';
  let db: Database;
  let close: () => Promise<void>;

  beforeAll(() => {
    ({ db, close } = createTestDb());
  });
  afterEach(async () => {
    vi.unstubAllGlobals();
    await resetDb(db);
  });
  afterAll(async () => {
    await close();
  });

  function makeResolver(searchResults: InstrumentSearchResult[], priced: string[]) {
    const quote = (symbol: string): Quote => ({ symbol, close: 100, currency: 'EUR', date: '2026-10-01' });
    const provider = stub<PriceProvider>({
      getQuotes: vi.fn((symbols: string[]) =>
        Promise.resolve(new Map(symbols.filter((s) => priced.includes(s)).map((s) => [s, quote(s)]))),
      ),
    });
    const search = { search: vi.fn().mockResolvedValue(searchResults) };
    const resolver = new OpenFigiSymbolResolver(db, provider, search, fakeConfig());
    return { resolver, search };
  }

  it('resolves via Yahoo search without calling OpenFIGI, and caches it', async () => {
    const openFigi = vi.fn();
    vi.stubGlobal('fetch', openFigi);
    const { resolver, search } = makeResolver([result('VAPU.L'), result('VWCE.DE')], ['VAPU.L', 'VWCE.DE']);

    await expect(resolver.resolve(ISIN)).resolves.toBe('VWCE.DE');
    expect(search.search).toHaveBeenCalledWith(ISIN);
    expect(openFigi).not.toHaveBeenCalled();

    const [row] = await db.select().from(instruments).where(eq(instruments.query, ISIN));
    expect(row).toMatchObject({ symbol: 'VWCE.DE', source: 'yahoo_search' });
  });

  it('falls back to OpenFIGI if no search result has a quote', async () => {
    const openFigi = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify([{ data: [{ ticker: 'VWCE', exchCode: 'NA' }] }]), { status: 200 }),
      );
    vi.stubGlobal('fetch', openFigi);
    const { resolver } = makeResolver([result('NOPE.L')], ['VWCE.AS']);

    await expect(resolver.resolve(ISIN)).resolves.toBe('VWCE.AS');
    expect(openFigi).toHaveBeenCalledOnce();
  });

  it('in the fallback, rejects a ticker quoted on an exchange where OpenFIGI does not list it', async () => {
    const listings = [
      { ticker: 'AMZN', exchCode: 'US' },
      { ticker: 'AMZ', exchCode: 'GY' },
      { ticker: null, exchCode: null },
    ];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify([{ data: listings }]), { status: 200 })),
    );
    // `AMZN.AS` has a quote (it is the ETP), but Amazon is not listed in Amsterdam.
    const { resolver } = makeResolver([], ['AMZN.AS', 'AMZ.DE', 'AMZN']);

    await expect(resolver.resolve('US0231351067')).resolves.toBe('AMZ.DE');
    const [row] = await db.select().from(instruments).where(eq(instruments.query, 'US0231351067'));
    expect(row).toMatchObject({ symbol: 'AMZ.DE', source: 'openfigi' });
  });
});

describe('OpenFigiSymbolResolver.resolveManyCached', () => {
  let db: Database;
  let close: () => Promise<void>;

  beforeAll(() => {
    ({ db, close } = createTestDb());
  });
  afterEach(async () => {
    await resetDb(db);
  });
  afterAll(async () => {
    await close();
  });

  it('resolves many from the cache in one query, without network, keeping the original input', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const now = new Date();
    await db.insert(instruments).values([
      { query: 'IE00BK5BQZ41', symbol: 'VWCE.DE', source: 'yahoo_search', resolvedAt: now },
      { query: 'AAPL', symbol: 'AAPL', source: 'identity', resolvedAt: now },
      { query: 'XX0000000000', symbol: null, source: 'not_found', resolvedAt: now },
    ]);
    const getQuotes = vi.fn();
    const provider = stub<PriceProvider>({ getQuotes });
    const resolver = new OpenFigiSymbolResolver(db, provider, { search: vi.fn() }, fakeConfig());

    const resolved = await resolver.resolveManyCached([' ie00bk5bqz41 ', 'AAPL', 'XX0000000000', 'NUEVO', '']);

    expect(resolved).toEqual(
      new Map([
        [' ie00bk5bqz41 ', 'VWCE.DE'],
        ['AAPL', 'AAPL'],
        ['XX0000000000', null],
        ['NUEVO', null],
        ['', null],
      ]),
    );
    await expect(resolver.resolveCached('aapl')).resolves.toBe('AAPL');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(getQuotes).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe('OpenFigiSymbolResolver.resolve — negative cache', () => {
  const HOUR = 60 * 60_000;
  let db: Database;
  let close: () => Promise<void>;

  beforeAll(() => {
    ({ db, close } = createTestDb());
  });
  afterEach(async () => {
    vi.useRealTimers();
    await resetDb(db);
  });
  afterAll(async () => {
    await close();
  });

  it('does not retry an unquoted ticker until its backoff expires; the backoff grows and resets on resolve', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-01T10:00:00Z'));
    let priced = false;
    const getQuotes = vi.fn((symbols: string[]) =>
      Promise.resolve(
        new Map(priced ? symbols.map((s) => [s, { symbol: s, close: 1, currency: 'EUR', date: '2026-10-01' }]) : []),
      ),
    );
    const provider = stub<PriceProvider>({ getQuotes });
    const resolver = new OpenFigiSymbolResolver(db, provider, { search: vi.fn() }, fakeConfig());

    await expect(resolver.resolve('NOPE.DE')).resolves.toBeNull();
    await expect(resolver.resolve('NOPE.DE')).resolves.toBeNull();
    expect(getQuotes).toHaveBeenCalledTimes(1);

    // The first backoff (1 h) expires: it retries, fails again and the next one is 2 h.
    vi.setSystemTime(Date.now() + HOUR + 1);
    await resolver.resolve('NOPE.DE');
    expect(getQuotes).toHaveBeenCalledTimes(2);
    vi.setSystemTime(Date.now() + HOUR + 1);
    await resolver.resolve('NOPE.DE');
    expect(getQuotes).toHaveBeenCalledTimes(2);

    vi.setSystemTime(Date.now() + HOUR);
    priced = true;
    await expect(resolver.resolve('NOPE.DE')).resolves.toBe('NOPE.DE');
    expect(getQuotes).toHaveBeenCalledTimes(3);
  });
});
