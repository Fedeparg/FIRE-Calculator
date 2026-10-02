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

/** Tope de candidatos que aplica el resolver (`MAX_CANDIDATES`). */
const MAX_CANDIDATES = 12;

/**
 * Listados reales de OpenFIGI para Amazon (US0231351067), recortados: la búsqueda de Yahoo falló
 * y el fallback probaba "AMZN" con sufijos europeos, y `AMZN.AS` es un ETP sobre Amazon (~7 €).
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
  it('prueba cada ticker solo con el sufijo de su bolsa, EUR primero y EE. UU. al final', () => {
    expect(isinCandidates(AMAZON_LISTINGS)).toEqual(['AMZ.DE', '1AMZN.MI', 'AMZN.SW', 'AMZNUSD.SW', '0R1O.L', 'AMZN']);
  });

  it('no inventa un listado que OpenFIGI no tiene (AMZN.AS es otro producto)', () => {
    expect(isinCandidates(AMAZON_LISTINGS)).not.toContain('AMZN.AS');
  });

  it('ignora los compuestos y los códigos sin bolsa de Yahoo', () => {
    expect(isinCandidates([{ exchCode: 'EO', ticker: 'X' }, { exchCode: 'XH', ticker: 'X' }, { ticker: 'X' }])).toEqual(
      [],
    );
  });

  it('normaliza a mayúsculas y quita espacios', () => {
    expect(isinCandidates([{ exchCode: ' na ', ticker: ' iwda ' }])).toEqual(['IWDA.AS']);
  });

  it('en un mismo sufijo prioriza el ticker más repetido', () => {
    const candidates = isinCandidates([
      { exchCode: 'GY', ticker: 'RARO' },
      { exchCode: 'GY', ticker: 'EUNL' },
      { exchCode: 'GR', ticker: 'EUNL' },
    ]);

    expect(candidates).toEqual(['EUNL.DE', 'RARO.DE']);
  });

  it('acota el número de candidatos y no repite ninguno', () => {
    const listings = Array.from({ length: MAX_CANDIDATES + 5 }, (_, i) => ({ exchCode: 'GY', ticker: `T${i}` }));
    const candidates = isinCandidates([...listings, ...listings]);

    expect(candidates).toHaveLength(MAX_CANDIDATES);
    expect(new Set(candidates).size).toBe(candidates.length);
  });

  it('devuelve lista vacía sin listados (o solo con basura)', () => {
    expect(isinCandidates([])).toEqual([]);
    expect(isinCandidates([{ exchCode: 'GY', ticker: '   ' }])).toEqual([]);
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

const result = (symbol: string, type: InstrumentSearchResult['type'] = 'etf'): InstrumentSearchResult => ({
  symbol,
  name: symbol,
  type,
  exchange: null,
});

describe('searchCandidates', () => {
  it('prefiere los mercados en euros y deja el resto en el orden de Yahoo', () => {
    expect(
      searchCandidates([result('VAPU.L'), result('IE00BK5BQZ41.SG', 'fund'), result('VWCE.DE'), result('VWCE.AS')]),
    ).toEqual(['VWCE.AS', 'VWCE.DE', 'VAPU.L', 'IE00BK5BQZ41.SG']);
  });

  it('acepta valores fuera de Europa (Hong Kong) cuando es lo único que hay', () => {
    expect(searchCandidates([result('1810.HK', 'equity')])).toEqual(['1810.HK']);
  });

  it('descarta lo que no puede ser el instrumento de un ISIN y no repite', () => {
    expect(
      searchCandidates([
        result('^GSPC', 'index'),
        result('EURUSD=X', 'currency'),
        result('aapl', 'equity'),
        result('AAPL', 'equity'),
      ]),
    ).toEqual(['AAPL']);
  });

  it('acota el número de candidatos a validar', () => {
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
    const provider = {
      getQuotes: vi.fn((symbols: string[]) =>
        Promise.resolve(new Map(symbols.filter((s) => priced.includes(s)).map((s) => [s, quote(s)]))),
      ),
    } as unknown as PriceProvider;
    const search = { search: vi.fn().mockResolvedValue(searchResults) };
    const resolver = new OpenFigiSymbolResolver(db, provider, search, fakeConfig());
    return { resolver, search };
  }

  it('resuelve con la búsqueda de Yahoo sin llamar a OpenFIGI, y lo cachea', async () => {
    const openFigi = vi.fn();
    vi.stubGlobal('fetch', openFigi);
    const { resolver, search } = makeResolver([result('VAPU.L'), result('VWCE.DE')], ['VAPU.L', 'VWCE.DE']);

    await expect(resolver.resolve(ISIN)).resolves.toBe('VWCE.DE');
    expect(search.search).toHaveBeenCalledWith(ISIN);
    expect(openFigi).not.toHaveBeenCalled();

    const [row] = await db.select().from(instruments).where(eq(instruments.query, ISIN));
    expect(row).toMatchObject({ symbol: 'VWCE.DE', source: 'yahoo_search' });
  });

  it('salta a OpenFIGI si ningún resultado de la búsqueda cotiza', async () => {
    const openFigi = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify([{ data: [{ ticker: 'VWCE', exchCode: 'NA' }] }]), { status: 200 }));
    vi.stubGlobal('fetch', openFigi);
    const { resolver } = makeResolver([result('NOPE.L')], ['VWCE.AS']);

    await expect(resolver.resolve(ISIN)).resolves.toBe('VWCE.AS');
    expect(openFigi).toHaveBeenCalledOnce();
  });

  it('en el fallback no acepta un ticker que cotiza en una bolsa donde OpenFIGI no lo lista', async () => {
    const listings = [{ ticker: 'AMZN', exchCode: 'US' }, { ticker: 'AMZ', exchCode: 'GY' }, { ticker: null, exchCode: null }];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify([{ data: listings }]), { status: 200 })));
    // `AMZN.AS` cotiza (es el ETP), pero Amazon no está listada en Amsterdam.
    const { resolver } = makeResolver([], ['AMZN.AS', 'AMZ.DE', 'AMZN']);

    await expect(resolver.resolve('US0231351067')).resolves.toBe('AMZ.DE');
    const [row] = await db.select().from(instruments).where(eq(instruments.query, 'US0231351067'));
    expect(row).toMatchObject({ symbol: 'AMZ.DE', source: 'openfigi' });
  });
});
