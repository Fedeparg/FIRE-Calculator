import { asc, eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { Database } from '../db/database.module.js';
import { instrumentPrices } from '../db/schema.js';
import { createTestDb, resetDb } from '../../test/db.js';
import type { PriceProvider, Quote } from './price-provider.interface.js';
import { PricesService } from './prices.service.js';
import type { SymbolResolver } from './symbol-resolver.js';

/** Resolutor identidad: el ticker ES el símbolo (el caso del buscador, sin OpenFIGI). */
const identityResolver: SymbolResolver = {
  resolve: (ticker) => Promise.resolve(ticker),
  resolveCached: (ticker) => Promise.resolve(ticker),
};

/**
 * Proveedor de prueba con histórico y cotizaciones programables, que además CUENTA las
 * llamadas: así se comprueba que `primeSymbol` pide el histórico una sola vez y que solo cae
 * a `getQuotes` cuando el histórico viene vacío.
 */
class StubProvider implements PriceProvider {
  readonly name = 'stub';
  history: Quote[] = [];
  quotes: Quote[] = [];
  historyCalls: string[] = [];
  quoteCalls: string[][] = [];

  getQuotes(symbols: string[]): Promise<Map<string, Quote>> {
    this.quoteCalls.push(symbols);
    const wanted = new Set(symbols);
    return Promise.resolve(
      new Map(this.quotes.filter((q) => wanted.has(q.symbol)).map((q) => [q.symbol, q])),
    );
  }

  getHistory(symbol: string): Promise<Quote[]> {
    this.historyCalls.push(symbol);
    return Promise.resolve(this.history.filter((q) => q.symbol === symbol));
  }
}

/** Atajo para construir una cotización. */
const quote = (symbol: string, date: string, close: number, currency = 'EUR'): Quote => ({
  symbol,
  date,
  close,
  currency,
});

describe('PricesService — caché de histórico (integración con Postgres)', () => {
  let db: Database;
  let close: () => Promise<void>;
  let provider: StubProvider;
  let service: PricesService;

  beforeAll(() => {
    ({ db, close } = createTestDb());
  });

  afterEach(async () => {
    await resetDb(db);
  });

  afterAll(async () => {
    await close();
  });

  /**
   * Servicio y proveedor NUEVOS para cada test: los contadores de llamadas deben empezar a
   * cero, así que no vale compartirlos desde `beforeAll`.
   */
  function makeService(): void {
    provider = new StubProvider();
    service = new PricesService(db, provider, identityResolver);
  }

  /** Filas cacheadas de un símbolo, en orden cronológico. */
  function cachedRows(symbol: string) {
    return db
      .select()
      .from(instrumentPrices)
      .where(eq(instrumentPrices.symbol, symbol))
      .orderBy(asc(instrumentPrices.date));
  }

  it('al dar de alta un símbolo cachea TODA su serie, no solo el último cierre', async () => {
    makeService();
    provider.history = [
      quote('IWDA', '2026-03-13', 95.1),
      quote('IWDA', '2026-03-14', 96.2),
      quote('IWDA', '2026-03-15', 97.3),
    ];

    await service.primeSymbol('IWDA', 'EUR');

    const rows = await cachedRows('IWDA');
    expect(rows.map((r) => r.date)).toEqual(['2026-03-13', '2026-03-14', '2026-03-15']);
    expect(rows.map((r) => r.close)).toEqual(['95.10000000', '96.20000000', '97.30000000']);
    expect(rows[0].source).toBe('stub');
    // Una sola petición de histórico por símbolo: no se repite por cada cierre.
    expect(provider.historyCalls).toEqual(['IWDA']);
  });

  it('reprimar el mismo símbolo ACTUALIZA los cierres en vez de duplicar filas', async () => {
    makeService();
    provider.history = [quote('IWDA', '2026-03-13', 95.1), quote('IWDA', '2026-03-14', 96.2)];
    await service.primeSymbol('IWDA');

    // La fuente corrige el cierre del día 14 (dato revisado) y añade el del 15.
    provider.history = [
      quote('IWDA', '2026-03-13', 95.1),
      quote('IWDA', '2026-03-14', 96.99),
      quote('IWDA', '2026-03-15', 97.3),
    ];
    await service.primeSymbol('IWDA');

    const rows = await cachedRows('IWDA');
    expect(rows).toHaveLength(3);
    expect(rows[1].close).toBe('96.99000000');
  });

  it('cachea también el par FX de la divisa de la posición (para el total agregado)', async () => {
    makeService();
    provider.history = [quote('AAPL', '2026-03-13', 180, 'USD')];
    provider.quotes = [quote('EURUSD=X', '2026-03-13', 1.1, 'USD')];

    await service.primeSymbol('AAPL', 'EUR');

    const fx = await service.getFxRates();
    expect(fx.rates.EUR).toBe(1.1);
    // Del instrumento se pide histórico; del par FX, solo el último cierre.
    expect(provider.historyCalls).toEqual(['AAPL']);
    expect(provider.quoteCalls).toEqual([['EURUSD=X']]);
  });

  it('no pide par FX si la posición ya está en la divisa puente (USD)', async () => {
    makeService();
    provider.history = [quote('AAPL', '2026-03-13', 180, 'USD')];

    await service.primeSymbol('AAPL', 'USD');

    expect(provider.quoteCalls).toEqual([]);
  });

  it('si la fuente no da histórico, cae al último cierre y la posición no se queda sin precio', async () => {
    makeService();
    provider.history = [];
    provider.quotes = [quote('RARO', '2026-03-15', 12.5)];

    await service.primeSymbol('RARO');

    const rows = await cachedRows('RARO');
    expect(rows).toHaveLength(1);
    expect(rows[0].close).toBe('12.50000000');
    expect(provider.quoteCalls).toEqual([['RARO']]);
  });

  it('un fallo de la fuente no propaga el error (el alta de la posición no se rompe)', async () => {
    makeService();
    provider.getHistory = () => Promise.reject(new Error('Yahoo caído'));

    await expect(service.primeSymbol('IWDA')).resolves.toBeUndefined();
    expect(await cachedRows('IWDA')).toHaveLength(0);
  });

  it('cachea una serie mayor que el tamaño de bloque del upsert', async () => {
    makeService();
    // 250 cierres ≈ un año de bolsa: cruza el bloque de 200 filas por sentencia.
    provider.history = Array.from({ length: 250 }, (_, i) =>
      quote('IWDA', new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10), 100 + i),
    );

    await service.primeSymbol('IWDA');

    const rows = await cachedRows('IWDA');
    expect(rows).toHaveLength(250);
    expect(rows[249].close).toBe('349.00000000');
  });

  it('getPrices devuelve el cierre MÁS RECIENTE de la serie cacheada', async () => {
    makeService();
    provider.history = [
      quote('IWDA', '2026-03-13', 95.1),
      quote('IWDA', '2026-03-15', 97.3),
      quote('IWDA', '2026-03-14', 96.2),
    ];
    await service.primeSymbol('IWDA');

    const prices = await service.getPrices(['IWDA']);

    expect(prices.get('IWDA')).toMatchObject({ close: 97.3, date: '2026-03-15' });
  });
});
