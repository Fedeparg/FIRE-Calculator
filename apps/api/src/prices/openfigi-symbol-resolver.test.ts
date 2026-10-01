import { ConfigService } from '@nestjs/config';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { Database } from '../db/database.module.js';
import { instruments } from '../db/schema.js';
import { createTestDb, resetDb } from '../../test/db.js';
import type { InstrumentSearchResult } from './instrument-search.js';
import {
  CRYPTO_TICKERS,
  isinCandidates,
  OpenFigiSymbolResolver,
  searchCandidates,
  tickerCandidates,
} from './openfigi-symbol-resolver.js';
import type { PriceProvider, Quote } from './price-provider.interface.js';

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
      searchCandidates([result('^GSPC', 'index'), result('EURUSD=X', 'currency'), result('aapl', 'equity'), result('AAPL', 'equity')]),
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
    const resolver = new OpenFigiSymbolResolver(db, provider, search, new ConfigService({}));
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
    const openFigi = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([{ data: [{ ticker: 'VWCE' }] }]), { status: 200 }),
    );
    vi.stubGlobal('fetch', openFigi);
    const { resolver } = makeResolver([result('NOPE.L')], ['VWCE.AS']);

    await expect(resolver.resolve(ISIN)).resolves.toBe('VWCE.AS');
    expect(openFigi).toHaveBeenCalledOnce();
  });
});
