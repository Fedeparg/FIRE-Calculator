import { asc, eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { firstItem, itemAt } from '@sextante/core/arrays';

import type { Database } from '../db/database.module.js';
import { instrumentPrices, instrumentSplitChecks, instrumentSplits, positionLots, positions } from '../db/schema.js';
import { createTestDb, insertUser, resetDb } from '../../test/db.js';
import type { PriceHistory, PriceProvider, Quote, SplitEvent } from './price-provider.interface.js';
import { PriceHistoryService } from './price-history.service.js';
import { PriceReadService } from './price-read.service.js';
import type { SymbolResolver } from './symbol-resolver.js';

/** Resolutor identidad: el ticker ES el símbolo (el caso del buscador, sin OpenFIGI). */
const identityResolver: SymbolResolver = {
  resolve: (ticker) => Promise.resolve(ticker),
  resolveCached: (ticker) => Promise.resolve(ticker),
  resolveManyCached: (tickers) => Promise.resolve(new Map(tickers.map((ticker) => [ticker, ticker]))),
};

/**
 * Proveedor de prueba con histórico y cotizaciones programables, que además CUENTA las
 * llamadas: así se comprueba que `primeSymbol` pide el histórico una sola vez y que solo cae
 * a `getQuotes` cuando el histórico viene vacío.
 */
class StubProvider implements PriceProvider {
  readonly name = 'stub';
  history: Quote[] = [];
  splits: SplitEvent[] = [];
  quotes: Quote[] = [];
  historyCalls: string[] = [];
  quoteCalls: string[][] = [];

  getQuotes(symbols: string[]): Promise<Map<string, Quote>> {
    this.quoteCalls.push(symbols);
    const wanted = new Set(symbols);
    return Promise.resolve(new Map(this.quotes.filter((q) => wanted.has(q.symbol)).map((q) => [q.symbol, q])));
  }

  getHistory(symbol: string): Promise<PriceHistory> {
    this.historyCalls.push(symbol);
    return Promise.resolve({
      quotes: this.history.filter((q) => q.symbol === symbol),
      splits: this.splits.filter((e) => e.symbol === symbol),
      dividends: [],
    });
  }
}

/** Atajo para construir una cotización. */
const quote = (symbol: string, date: string, close: number, currency = 'EUR'): Quote => ({
  symbol,
  date,
  close,
  currency,
});

/** Fecha (YYYY-MM-DD) de hace `days` días, para probar cobertura/backfill sin fechas fijas. */
const daysAgo = (days: number): string => new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

describe('PriceReadService + PriceHistoryService — caché de histórico (integración con Postgres)', () => {
  let db: Database;
  let close: () => Promise<void>;
  let provider: StubProvider;
  let reads: PriceReadService;
  let history: PriceHistoryService;

  beforeAll(() => {
    ({ db, close } = createTestDb());
  });

  // Reloj congelado (solo `Date`) para que las fechas relativas no se desfasen en la medianoche UTC.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date() });
  });

  afterEach(async () => {
    vi.useRealTimers();
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
    reads = new PriceReadService(db, identityResolver);
    history = new PriceHistoryService(db, provider, identityResolver, reads);
    history.historyRequestDelayMs = 0;
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

    await history.primeSymbol('IWDA', 'EUR');

    const rows = await cachedRows('IWDA');
    expect(rows.map((r) => r.date)).toEqual(['2026-03-13', '2026-03-14', '2026-03-15']);
    expect(rows.map((r) => r.close)).toEqual(['95.10000000', '96.20000000', '97.30000000']);
    expect(itemAt(rows, 0).source).toBe('stub');
    // Una sola petición de histórico por símbolo: no se repite por cada cierre.
    expect(provider.historyCalls.filter((symbol) => symbol === 'IWDA')).toEqual(['IWDA']);
  });

  it('reprimar el mismo símbolo ACTUALIZA los cierres en vez de duplicar filas', async () => {
    makeService();
    provider.history = [quote('IWDA', '2026-03-13', 95.1), quote('IWDA', '2026-03-14', 96.2)];
    await history.primeSymbol('IWDA');

    // La fuente corrige el cierre del día 14 (dato revisado) y añade el del 15.
    provider.history = [
      quote('IWDA', '2026-03-13', 95.1),
      quote('IWDA', '2026-03-14', 96.99),
      quote('IWDA', '2026-03-15', 97.3),
    ];
    await history.primeSymbol('IWDA');

    const rows = await cachedRows('IWDA');
    expect(rows).toHaveLength(3);
    expect(itemAt(rows, 1).close).toBe('96.99000000');
  });

  it('cachea también el HISTÓRICO del par FX de la divisa de la posición, no solo el último cierre', async () => {
    makeService();
    provider.history = [
      quote('AAPL', '2026-03-13', 180, 'USD'),
      quote('EURUSD=X', '2026-03-11', 1.08, 'USD'),
      quote('EURUSD=X', '2026-03-12', 1.09, 'USD'),
      quote('EURUSD=X', '2026-03-13', 1.1, 'USD'),
    ];

    await history.primeSymbol('AAPL', 'EUR');

    const fx = await reads.getFxRates();
    expect(fx.rates.EUR).toBe(1.1);
    // Del instrumento y del par FX se pide histórico (el backfill de snapshots necesita
    // reexpresar también días PASADOS a la divisa de la posición, no solo el de hoy).
    expect(provider.historyCalls).toEqual(['AAPL', 'EURUSD=X']);
    expect(await cachedRows('EURUSD=X')).toHaveLength(3);
    // Como el histórico cubrió los días pedidos, no hace falta caer al último cierre.
    expect(provider.quoteCalls).toEqual([]);
  });

  it('si la fuente no da histórico del par FX, cae al último cierre igualmente', async () => {
    makeService();
    provider.history = [quote('AAPL', '2026-03-13', 180, 'USD')];
    provider.quotes = [quote('EURUSD=X', '2026-03-13', 1.1, 'USD')];

    await history.primeSymbol('AAPL', 'EUR');

    const fx = await reads.getFxRates();
    expect(fx.rates.EUR).toBe(1.1);
    expect(provider.quoteCalls).toEqual([['EURUSD=X']]);
  });

  it('con la posición en USD no pide un par USDUSD: solo el EUR, la base de los snapshots', async () => {
    makeService();
    provider.history = [quote('AAPL', '2026-03-13', 180, 'USD'), quote('EURUSD=X', '2026-03-13', 1.1, 'USD')];

    await history.primeSymbol('AAPL', 'USD');

    expect(provider.historyCalls).toEqual(['AAPL', 'EURUSD=X']);
  });

  it('si la fuente no da histórico, cae al último cierre y la posición no se queda sin precio', async () => {
    makeService();
    provider.history = [];
    provider.quotes = [quote('RARO', '2026-03-15', 12.5)];

    await history.primeSymbol('RARO');

    const rows = await cachedRows('RARO');
    expect(rows).toHaveLength(1);
    expect(itemAt(rows, 0).close).toBe('12.50000000');
    // Y, como el resto de altas, asegura la tasa EUR (la base de los snapshots): sin histórico
    // del par, también cae a su último cierre.
    expect(provider.quoteCalls).toEqual([['RARO'], ['EURUSD=X']]);
  });

  it('un fallo de la fuente no propaga el error (el alta de la posición no se rompe)', async () => {
    makeService();
    provider.getHistory = () => Promise.reject(new Error('Yahoo caído'));

    await expect(history.primeSymbol('IWDA')).resolves.toBeUndefined();
    expect(await cachedRows('IWDA')).toHaveLength(0);
  });

  it('cachea una serie mayor que el tamaño de bloque del upsert', async () => {
    makeService();
    // 250 cierres ≈ un año de bolsa: cruza el bloque de 200 filas por sentencia.
    provider.history = Array.from({ length: 250 }, (_, i) =>
      quote('IWDA', new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10), 100 + i),
    );

    await history.primeSymbol('IWDA');

    const rows = await cachedRows('IWDA');
    expect(rows).toHaveLength(250);
    expect(itemAt(rows, 249).close).toBe('349.00000000');
  });

  it('getPrices devuelve el cierre MÁS RECIENTE de la serie cacheada', async () => {
    makeService();
    provider.history = [
      quote('IWDA', '2026-03-13', 95.1),
      quote('IWDA', '2026-03-15', 97.3),
      quote('IWDA', '2026-03-14', 96.2),
    ];
    await history.primeSymbol('IWDA');

    const prices = await reads.getPrices(['IWDA']);

    expect(prices.get('IWDA')).toMatchObject({ close: 97.3, date: '2026-03-15' });
  });

  it('getPrices incluye el cierre anterior para la variación del día', async () => {
    makeService();
    provider.history = [quote('IWDA', '2026-03-13', 95.1), quote('IWDA', '2026-03-16', 97.3)];
    await history.primeSymbol('IWDA');

    // El anterior es la sesión previa en la serie, aunque haya un fin de semana entre medias.
    expect((await reads.getPrices(['IWDA'])).get('IWDA')).toMatchObject({ close: 97.3, previousClose: 95.1 });
  });

  it('getPrices deja el cierre anterior a null si solo hay un dato', async () => {
    makeService();
    provider.history = [quote('IWDA', '2026-03-16', 97.3)];
    await history.primeSymbol('IWDA');

    expect((await reads.getPrices(['IWDA'])).get('IWDA')?.previousClose).toBeNull();
  });

  it('getPrices toma, de cada símbolo por separado, su último cierre y el anterior', async () => {
    makeService();
    const row = (symbol: string, date: string, close: string) => ({
      symbol,
      date,
      close,
      currency: 'EUR',
      source: 'stub',
      fetchedAt: new Date(`${date}T18:00:00Z`),
    });
    await db
      .insert(instrumentPrices)
      .values([
        row('IWDA', '2026-03-10', '90'),
        row('IWDA', '2026-03-12', '92'),
        row('IWDA', '2026-03-11', '91'),
        row('EUNL', '2026-03-13', '50'),
        row('EUNL', '2026-03-09', '48'),
        row('SOLO', '2026-03-01', '7'),
      ]);

    const prices = await reads.getPrices(['IWDA', 'EUNL', 'SOLO', 'SIN-DATOS']);

    expect(prices.get('IWDA')).toMatchObject({ close: 92, previousClose: 91, date: '2026-03-12' });
    expect(prices.get('EUNL')).toMatchObject({ close: 50, previousClose: 48, date: '2026-03-13' });
    expect(prices.get('SOLO')).toMatchObject({ close: 7, previousClose: null });
    expect(prices.get('IWDA')?.fetchedAt).toBe('2026-03-12T18:00:00.000Z');
    expect(prices.has('SIN-DATOS')).toBe(false);
  });

  it('getPrices expone cuándo se leyó el precio (fetchedAt), para el "actualizado hace…"', async () => {
    makeService();
    provider.history = [quote('IWDA', '2026-03-15', 97.3)];
    const before = Date.now();
    await history.primeSymbol('IWDA');

    const fetchedAt = (await reads.getPrices(['IWDA'])).get('IWDA')?.fetchedAt;

    expect(fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(Date.parse(fetchedAt ?? '')).toBeGreaterThanOrEqual(before - 1000);
  });

  describe('getSeriesSince — series para reconstruir el histórico', () => {
    it('devuelve la serie de cada ticker y de cada divisa con cierre, en una pasada', async () => {
      makeService();
      provider.history = [
        quote('IWDA', daysAgo(3), 90),
        quote('IWDA', daysAgo(2), 92),
        quote('EURUSD=X', daysAgo(2), 1.1, 'USD'),
      ];
      await history.ensureHistory(
        new Map([
          ['IWDA', daysAgo(3)],
          ['EURUSD=X', daysAgo(3)],
        ]),
      );

      const { prices, fx } = await reads.getSeriesSince(
        await reads.resolveCachedTickers(['IWDA', 'DESCONOCIDO']),
        daysAgo(3),
      );

      expect(prices.IWDA?.map((p) => p.close)).toEqual([90, 92]);
      expect(prices.IWDA?.[0]).toEqual({ date: daysAgo(3), close: 90, currency: 'EUR' });
      expect(prices.DESCONOCIDO).toBeUndefined();
      expect(fx.EUR).toEqual([{ date: daysAgo(2), rate: 1.1 }]);
      expect(fx.GBP).toBeUndefined();
    });

    it('incluye unos días ANTERIORES a `from` para poder arrastrar el cierre previo', async () => {
      makeService();
      provider.history = [quote('IWDA', daysAgo(25), 80), quote('IWDA', daysAgo(8), 90), quote('IWDA', daysAgo(1), 95)];
      await history.ensureHistory(new Map([['IWDA', daysAgo(25)]]));

      const { prices } = await reads.getSeriesSince(await reads.resolveCachedTickers(['IWDA']), daysAgo(5));

      // `daysAgo(8)` entra (margen de arrastre); `daysAgo(25)` queda fuera.
      expect(prices.IWDA?.map((p) => p.close)).toEqual([90, 95]);
    });

    it('sin tickers ni símbolos con datos devuelve series vacías sin fallar', async () => {
      makeService();

      await expect(reads.getSeriesSince(new Map(), daysAgo(5))).resolves.toEqual({ prices: {}, fx: {}, splits: {} });
    });
  });

  describe('splits', () => {
    it('cachea los splits con el histórico y getSeriesSince los devuelve por ticker', async () => {
      makeService();
      provider.history = [quote('NVDA', daysAgo(2), 100, 'USD')];
      provider.splits = [{ symbol: 'NVDA', date: daysAgo(5), ratio: 10 }];

      await history.primeSymbol('NVDA', 'USD');
      // Reprimar no duplica el split (PK symbol+date).
      await history.primeSymbol('NVDA', 'USD');

      const { splits } = await reads.getSeriesSince(await reads.resolveCachedTickers(['NVDA']), daysAgo(10));
      expect(splits).toEqual({ NVDA: [{ date: daysAgo(5), ratio: 10 }] });
    });
  });

  describe('marca de splits consultados', () => {
    /** Símbolo ya cacheado ANTES de existir los splits: precios con cobertura, sin splits ni marca. */
    async function seedLegacySymbol(): Promise<void> {
      const userId = await insertUser(db, 'legacy@example.com');
      const position = firstItem(
        await db
          .insert(positions)
          .values({ userId, ticker: 'NVDA', quantity: '10', avgPrice: '100', currency: 'USD' })
          .returning(),
      );
      await db.insert(positionLots).values({
        positionId: position.id,
        userId,
        kind: 'buy',
        quantity: '10',
        price: '100',
        tradedAt: daysAgo(30),
      });
      await db.insert(instrumentPrices).values({
        symbol: 'NVDA',
        date: daysAgo(30),
        close: '100',
        currency: 'USD',
        source: 'stub',
      });
    }

    it('el arranque reconsulta un símbolo con cobertura suficiente pero sin marca, y carga sus splits', async () => {
      makeService();
      await seedLegacySymbol();
      provider.history = [quote('NVDA', daysAgo(30), 100, 'USD')];
      provider.splits = [{ symbol: 'NVDA', date: daysAgo(10), ratio: 10 }];

      await history.ensureHistoryForActivePositions();

      expect(provider.historyCalls).toContain('NVDA');
      expect(await db.select().from(instrumentSplits)).toHaveLength(1);
      expect(await db.select().from(instrumentSplitChecks)).toHaveLength(1);
    });

    it('con la marca reciente no vuelve a pedir nada (aunque no haya splits)', async () => {
      makeService();
      await seedLegacySymbol();
      provider.history = [quote('NVDA', daysAgo(30), 100, 'USD')];
      await history.ensureHistoryForActivePositions();
      provider.historyCalls = [];

      await history.ensureHistoryForActivePositions();

      expect(provider.historyCalls).not.toContain('NVDA');
    });

    it('si la fuente falla (histórico vacío), no se escribe la marca', async () => {
      makeService();
      await seedLegacySymbol();
      provider.history = []; // Yahoo caído: `getHistory` devuelve vacío

      await history.ensureHistoryForActivePositions();

      expect(await db.select().from(instrumentSplitChecks)).toEqual([]);
    });

    it('refreshStaleSplits respeta el tope por pasada y empieza por la marca más antigua', async () => {
      makeService();
      const userId = await insertUser(db, 'muchos@example.com');
      const tickers = Array.from({ length: 45 }, (_, i) => `T${String(i).padStart(2, '0')}`);
      await db.insert(positions).values(tickers.map((ticker) => ({ userId, ticker, quantity: '1', avgPrice: '1' })));
      // T44 es el más antiguo de todos; el resto, marcas del mismo día vencidas.
      await db.insert(instrumentSplitChecks).values(
        tickers.map((symbol, i) => ({
          symbol,
          checkedAt: new Date(Date.now() - (i === 44 ? 30 : 8) * 86_400_000),
        })),
      );
      provider.history = tickers.map((symbol) => quote(symbol, daysAgo(1), 1));

      await history.refreshStaleSplits();

      expect(provider.historyCalls).toHaveLength(40);
      expect(provider.historyCalls[0]).toBe('T44');
    });

    it('refreshStaleSplits reconsulta solo los símbolos con la marca de más de 7 días', async () => {
      makeService();
      await seedLegacySymbol();
      provider.history = [quote('NVDA', daysAgo(30), 100, 'USD')];
      await history.ensureHistoryForActivePositions();
      provider.historyCalls = [];

      await history.refreshStaleSplits();
      expect(provider.historyCalls).toEqual([]);

      await db.update(instrumentSplitChecks).set({ checkedAt: new Date(Date.now() - 8 * 86_400_000) });
      provider.splits = [{ symbol: 'NVDA', date: daysAgo(2), ratio: 4 }];
      await history.refreshStaleSplits();

      expect(provider.historyCalls).toEqual(['NVDA']);
      expect((await db.select().from(instrumentSplits)).map((r) => r.ratio)).toEqual(['4.00000000']);
    });
  });

  describe('ensureHistoryForTicker', () => {
    it('pide histórico solo si la cobertura no llega a la fecha del lote', async () => {
      makeService();
      provider.history = [quote('IWDA', daysAgo(100), 90), quote('IWDA', daysAgo(1), 100)];
      await history.ensureHistoryForTicker('IWDA', daysAgo(100));
      provider.historyCalls = [];

      await history.ensureHistoryForTicker('IWDA', daysAgo(50)); // ya cubierto
      expect(provider.historyCalls).not.toContain('IWDA');

      await history.ensureHistoryForTicker('IWDA', daysAgo(300)); // lote más antiguo
      expect(provider.historyCalls).toContain('IWDA');
    });
  });

  describe('ensureHistory — guard de cobertura', () => {
    it('no vuelve a pedir histórico si el símbolo ya llega hasta la fecha requerida', async () => {
      makeService();
      provider.history = [quote('IWDA', daysAgo(1), 100), quote('IWDA', daysAgo(400), 90)];
      const required = new Map([['IWDA', daysAgo(395)]]);
      await history.ensureHistory(required);
      expect(provider.historyCalls).toEqual(['IWDA']);

      provider.historyCalls = [];
      await history.ensureHistory(required);

      expect(provider.historyCalls).toEqual([]);
    });

    it('tolera que la primera barra caiga unos días después de la fecha (fin de semana)', async () => {
      makeService();
      provider.history = [quote('IWDA', daysAgo(97), 90), quote('IWDA', daysAgo(1), 100)];
      await history.ensureHistory(new Map([['IWDA', daysAgo(100)]]));
      provider.historyCalls = [];

      await history.ensureHistory(new Map([['IWDA', daysAgo(100)]]));

      expect(provider.historyCalls).toEqual([]);
    });

    it('vuelve a pedir histórico si la cobertura no llega a la fecha requerida', async () => {
      makeService();
      provider.history = [quote('IWDA', daysAgo(2), 100)];
      await history.ensureHistory(new Map([['IWDA', daysAgo(30)]]));
      expect(provider.historyCalls).toEqual(['IWDA']);

      provider.historyCalls = [];
      await history.ensureHistory(new Map([['IWDA', daysAgo(30)]]));

      // El stub no añade más historia entre llamadas: sigue faltando cobertura.
      expect(provider.historyCalls).toEqual(['IWDA']);
    });

    it('un símbolo sin ninguna fila cacheada también cuenta como falto de cobertura', async () => {
      makeService();
      provider.history = [quote('IWDA', daysAgo(1), 100)];

      await history.ensureHistory(new Map([['IWDA', daysAgo(1)]]));

      expect(provider.historyCalls).toEqual(['IWDA']);
      expect(await cachedRows('IWDA')).toHaveLength(1);
    });

    it('cada símbolo se evalúa con su propia fecha: solo se piden los que no llegan', async () => {
      makeService();
      provider.history = [quote('AAA', daysAgo(200), 1), quote('BBB', daysAgo(5), 1)];
      await history.ensureHistory(
        new Map([
          ['AAA', daysAgo(200)],
          ['BBB', daysAgo(5)],
        ]),
      );
      provider.historyCalls = [];

      await history.ensureHistory(
        new Map([
          ['AAA', daysAgo(190)],
          ['BBB', daysAgo(100)],
        ]),
      );

      expect(provider.historyCalls).toEqual(['BBB']);
    });

    it('un fallo de la fuente en un símbolo no impide pedir el siguiente', async () => {
      makeService();
      provider.history = [quote('BBB', daysAgo(1), 1)];
      const original = provider.getHistory.bind(provider);
      provider.getHistory = (symbol) =>
        symbol === 'AAA' ? Promise.reject(new Error('Yahoo caído')) : original(symbol);

      await history.ensureHistory(
        new Map([
          ['AAA', daysAgo(1)],
          ['BBB', daysAgo(1)],
        ]),
      );

      expect(await cachedRows('BBB')).toHaveLength(1);
    });
  });

  describe('ensureHistoryForActivePositions', () => {
    /** Posición con un único lote de compra en `tradedAt`. */
    async function insertPositionWithLot(ticker: string, currency: string, tradedAt: string): Promise<void> {
      const userId = await insertUser(db, `${ticker}@example.com`);
      const position = firstItem(
        await db.insert(positions).values({ userId, ticker, quantity: '10', avgPrice: '150', currency }).returning(),
      );
      await db.insert(positionLots).values({
        positionId: position.id,
        userId,
        kind: 'buy',
        quantity: '10',
        price: '150',
        tradedAt,
      });
    }

    it('pide histórico de los símbolos en uso y de todos los pares FX soportados', async () => {
      makeService();
      await insertPositionWithLot('AAPL', 'USD', daysAgo(30));
      provider.history = [quote('AAPL', daysAgo(30), 180, 'USD')];

      await history.ensureHistoryForActivePositions();

      expect(await cachedRows('AAPL')).toHaveLength(1);
      // El par EUR/USD se asegura SIEMPRE (para el total agregado), aunque ninguna posición
      // esté en EUR: cualquier usuario puede elegir esa divisa de visualización.
      expect(provider.historyCalls).toEqual(expect.arrayContaining(['AAPL', 'EURUSD=X']));
    });

    it('no vuelve a pedir nada cuando el histórico ya llega a la primera operación', async () => {
      makeService();
      await insertPositionWithLot('AAPL', 'USD', daysAgo(30));
      provider.history = [quote('AAPL', daysAgo(30), 180, 'USD'), quote('EURUSD=X', daysAgo(30), 1.1, 'USD')];
      await history.ensureHistoryForActivePositions();
      provider.historyCalls = [];

      await history.ensureHistoryForActivePositions();

      // Los pares sin datos en el stub (GBP, JPY…) se reintentan; el instrumento y el EUR no.
      expect(provider.historyCalls).not.toContain('AAPL');
      expect(provider.historyCalls).not.toContain('EURUSD=X');
    });

    it('con una operación más antigua que el histórico cacheado, vuelve a pedirlo', async () => {
      makeService();
      await insertPositionWithLot('AAPL', 'USD', daysAgo(400));
      await db.insert(instrumentPrices).values({
        symbol: 'AAPL',
        date: daysAgo(365),
        close: '170',
        currency: 'USD',
        source: 'stub',
      });
      provider.history = [quote('AAPL', daysAgo(400), 150, 'USD')];

      await history.ensureHistoryForActivePositions();

      expect(provider.historyCalls).toContain('AAPL');
      expect((await cachedRows('AAPL')).map((r) => r.date)).toContain(daysAgo(400));
    });

    it('una posición sin lotes también entra, con su fecha de alta como primera operación', async () => {
      makeService();
      const userId = await insertUser(db, 'sinlotes@example.com');
      await db.insert(positions).values({ userId, ticker: 'MSFT', quantity: '1', avgPrice: '1', currency: 'USD' });
      provider.history = [quote('MSFT', daysAgo(0), 400, 'USD')];

      await history.ensureHistoryForActivePositions();

      expect(provider.historyCalls).toContain('MSFT');
    });

    it('sin posiciones, no pide histórico de instrumentos pero sí el de los pares FX', async () => {
      makeService();

      await history.ensureHistoryForActivePositions();

      expect(provider.historyCalls).toEqual(expect.arrayContaining(['EURUSD=X']));
      expect(provider.historyCalls).not.toContain('AAPL');
    });
  });
});
