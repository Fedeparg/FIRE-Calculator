import { asc, eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { Database } from '../db/database.module.js';
import { instrumentPrices, positionLots, positions } from '../db/schema.js';
import { createTestDb, insertUser, resetDb } from '../../test/db.js';
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

/** Fecha (YYYY-MM-DD) de hace `days` días, para probar cobertura/backfill sin fechas fijas. */
const daysAgo = (days: number): string =>
  new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

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
    expect(provider.historyCalls.filter((symbol) => symbol === 'IWDA')).toEqual(['IWDA']);
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

  it('cachea también el HISTÓRICO del par FX de la divisa de la posición, no solo el último cierre', async () => {
    makeService();
    provider.history = [
      quote('AAPL', '2026-03-13', 180, 'USD'),
      quote('EURUSD=X', '2026-03-11', 1.08, 'USD'),
      quote('EURUSD=X', '2026-03-12', 1.09, 'USD'),
      quote('EURUSD=X', '2026-03-13', 1.1, 'USD'),
    ];

    await service.primeSymbol('AAPL', 'EUR');

    const fx = await service.getFxRates();
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

    await service.primeSymbol('AAPL', 'EUR');

    const fx = await service.getFxRates();
    expect(fx.rates.EUR).toBe(1.1);
    expect(provider.quoteCalls).toEqual([['EURUSD=X']]);
  });

  it('con la posición en USD no pide un par USDUSD: solo el EUR, la base de los snapshots', async () => {
    makeService();
    provider.history = [
      quote('AAPL', '2026-03-13', 180, 'USD'),
      quote('EURUSD=X', '2026-03-13', 1.1, 'USD'),
    ];

    await service.primeSymbol('AAPL', 'USD');

    expect(provider.historyCalls).toEqual(['AAPL', 'EURUSD=X']);
  });

  it('si la fuente no da histórico, cae al último cierre y la posición no se queda sin precio', async () => {
    makeService();
    provider.history = [];
    provider.quotes = [quote('RARO', '2026-03-15', 12.5)];

    await service.primeSymbol('RARO');

    const rows = await cachedRows('RARO');
    expect(rows).toHaveLength(1);
    expect(rows[0].close).toBe('12.50000000');
    // Y, como el resto de altas, asegura la tasa EUR (la base de los snapshots): sin histórico
    // del par, también cae a su último cierre.
    expect(provider.quoteCalls).toEqual([['RARO'], ['EURUSD=X']]);
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

  it('getPrices incluye el cierre anterior para la variación del día', async () => {
    makeService();
    provider.history = [quote('IWDA', '2026-03-13', 95.1), quote('IWDA', '2026-03-16', 97.3)];
    await service.primeSymbol('IWDA');

    // El anterior es la sesión previa en la serie, aunque haya un fin de semana entre medias.
    expect((await service.getPrices(['IWDA'])).get('IWDA')).toMatchObject({ close: 97.3, previousClose: 95.1 });
  });

  it('getPrices deja el cierre anterior a null si solo hay un dato', async () => {
    makeService();
    provider.history = [quote('IWDA', '2026-03-16', 97.3)];
    await service.primeSymbol('IWDA');

    expect((await service.getPrices(['IWDA'])).get('IWDA')?.previousClose).toBeNull();
  });

  it('getPrices expone cuándo se leyó el precio (fetchedAt), para el "actualizado hace…"', async () => {
    makeService();
    provider.history = [quote('IWDA', '2026-03-15', 97.3)];
    const before = Date.now();
    await service.primeSymbol('IWDA');

    const fetchedAt = (await service.getPrices(['IWDA'])).get('IWDA')?.fetchedAt;

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
      await service.ensureHistory(
        new Map([
          ['IWDA', daysAgo(3)],
          ['EURUSD=X', daysAgo(3)],
        ]),
      );

      const { prices, fx } = await service.getSeriesSince(['IWDA', 'DESCONOCIDO'], daysAgo(3));

      expect(prices.IWDA.map((p) => p.close)).toEqual([90, 92]);
      expect(prices.IWDA[0]).toEqual({ date: daysAgo(3), close: 90, currency: 'EUR' });
      expect(prices.DESCONOCIDO).toBeUndefined();
      expect(fx.EUR).toEqual([{ date: daysAgo(2), rate: 1.1 }]);
      expect(fx.GBP).toBeUndefined();
    });

    it('incluye unos días ANTERIORES a `from` para poder arrastrar el cierre previo', async () => {
      makeService();
      provider.history = [quote('IWDA', daysAgo(25), 80), quote('IWDA', daysAgo(8), 90), quote('IWDA', daysAgo(1), 95)];
      await service.ensureHistory(new Map([['IWDA', daysAgo(25)]]));

      const { prices } = await service.getSeriesSince(['IWDA'], daysAgo(5));

      // `daysAgo(8)` entra (margen de arrastre); `daysAgo(25)` queda fuera.
      expect(prices.IWDA.map((p) => p.close)).toEqual([90, 95]);
    });

    it('sin tickers ni símbolos con datos devuelve series vacías sin fallar', async () => {
      makeService();

      await expect(service.getSeriesSince([], daysAgo(5))).resolves.toEqual({ prices: {}, fx: {} });
    });
  });

  describe('ensureHistory — guard de cobertura', () => {
    it('no vuelve a pedir histórico si el símbolo ya llega hasta la fecha requerida', async () => {
      makeService();
      provider.history = [quote('IWDA', daysAgo(1), 100), quote('IWDA', daysAgo(400), 90)];
      const required = new Map([['IWDA', daysAgo(395)]]);
      await service.ensureHistory(required);
      expect(provider.historyCalls).toEqual(['IWDA']);

      provider.historyCalls = [];
      await service.ensureHistory(required);

      expect(provider.historyCalls).toEqual([]);
    });

    it('tolera que la primera barra caiga unos días después de la fecha (fin de semana)', async () => {
      makeService();
      provider.history = [quote('IWDA', daysAgo(97), 90), quote('IWDA', daysAgo(1), 100)];
      await service.ensureHistory(new Map([['IWDA', daysAgo(100)]]));
      provider.historyCalls = [];

      await service.ensureHistory(new Map([['IWDA', daysAgo(100)]]));

      expect(provider.historyCalls).toEqual([]);
    });

    it('vuelve a pedir histórico si la cobertura no llega a la fecha requerida', async () => {
      makeService();
      provider.history = [quote('IWDA', daysAgo(2), 100)];
      await service.ensureHistory(new Map([['IWDA', daysAgo(30)]]));
      expect(provider.historyCalls).toEqual(['IWDA']);

      provider.historyCalls = [];
      await service.ensureHistory(new Map([['IWDA', daysAgo(30)]]));

      // El stub no añade más historia entre llamadas: sigue faltando cobertura.
      expect(provider.historyCalls).toEqual(['IWDA']);
    });

    it('un símbolo sin ninguna fila cacheada también cuenta como falto de cobertura', async () => {
      makeService();
      provider.history = [quote('IWDA', daysAgo(1), 100)];

      await service.ensureHistory(new Map([['IWDA', daysAgo(1)]]));

      expect(provider.historyCalls).toEqual(['IWDA']);
      expect(await cachedRows('IWDA')).toHaveLength(1);
    });

    it('cada símbolo se evalúa con su propia fecha: solo se piden los que no llegan', async () => {
      makeService();
      provider.history = [quote('AAA', daysAgo(200), 1), quote('BBB', daysAgo(5), 1)];
      await service.ensureHistory(new Map([['AAA', daysAgo(200)], ['BBB', daysAgo(5)]]));
      provider.historyCalls = [];

      await service.ensureHistory(new Map([['AAA', daysAgo(190)], ['BBB', daysAgo(100)]]));

      expect(provider.historyCalls).toEqual(['BBB']);
    });

    it('un fallo de la fuente en un símbolo no impide pedir el siguiente', async () => {
      makeService();
      provider.history = [quote('BBB', daysAgo(1), 1)];
      const original = provider.getHistory.bind(provider);
      provider.getHistory = (symbol) =>
        symbol === 'AAA' ? Promise.reject(new Error('Yahoo caído')) : original(symbol);

      await service.ensureHistory(new Map([['AAA', daysAgo(1)], ['BBB', daysAgo(1)]]));

      expect(await cachedRows('BBB')).toHaveLength(1);
    });
  });

  describe('ensureHistoryForActivePositions', () => {
    /** Posición con un único lote de compra en `tradedAt`. */
    async function insertPositionWithLot(ticker: string, currency: string, tradedAt: string): Promise<void> {
      const userId = await insertUser(db, `${ticker}@example.com`);
      const [position] = await db
        .insert(positions)
        .values({ userId, ticker, quantity: '10', avgPrice: '150', currency })
        .returning();
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

      await service.ensureHistoryForActivePositions();

      expect(await cachedRows('AAPL')).toHaveLength(1);
      // El par EUR/USD se asegura SIEMPRE (para el total agregado), aunque ninguna posición
      // esté en EUR: cualquier usuario puede elegir esa divisa de visualización.
      expect(provider.historyCalls).toEqual(expect.arrayContaining(['AAPL', 'EURUSD=X']));
    });

    it('no vuelve a pedir nada cuando el histórico ya llega a la primera operación', async () => {
      makeService();
      await insertPositionWithLot('AAPL', 'USD', daysAgo(30));
      provider.history = [quote('AAPL', daysAgo(30), 180, 'USD'), quote('EURUSD=X', daysAgo(30), 1.1, 'USD')];
      await service.ensureHistoryForActivePositions();
      provider.historyCalls = [];

      await service.ensureHistoryForActivePositions();

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

      await service.ensureHistoryForActivePositions();

      expect(provider.historyCalls).toContain('AAPL');
      expect((await cachedRows('AAPL')).map((r) => r.date)).toContain(daysAgo(400));
    });

    it('sin posiciones, no pide histórico de instrumentos pero sí el de los pares FX', async () => {
      makeService();

      await service.ensureHistoryForActivePositions();

      expect(provider.historyCalls).toEqual(expect.arrayContaining(['EURUSD=X']));
      expect(provider.historyCalls).not.toContain('AAPL');
    });
  });
});
