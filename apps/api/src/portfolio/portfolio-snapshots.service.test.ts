import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { Database } from '../db/database.module';
import { instrumentPrices, portfolioSnapshots } from '../db/schema';
import { PositionLotsService } from '../positions/position-lots.service';
import { PositionsService } from '../positions/positions.service';
import type { PriceProvider } from '../prices/price-provider.interface';
import { PricesService } from '../prices/prices.service';
import type { SymbolResolver } from '../prices/symbol-resolver';
import { createTestDb, insertUser, resetDb } from '../../test/db';
import { PortfolioSnapshotsService } from './portfolio-snapshots.service';
import { PortfolioValuationService } from './portfolio-valuation.service';

/**
 * Resolutor identidad: el ticker ES el símbolo. Evita salir a OpenFIGI en los tests, igual
 * que hace el resolutor real cuando el usuario teclea un símbolo exacto.
 */
const identityResolver: SymbolResolver = {
  resolve: (ticker) => Promise.resolve(ticker),
  resolveCached: (ticker) => Promise.resolve(ticker),
};

/** Proveedor mudo: los snapshots leen precios de NUESTRA base de datos, nunca de la fuente. */
const silentProvider: PriceProvider = {
  name: 'test',
  getQuotes: () => Promise.resolve(new Map()),
  getHistory: () => Promise.resolve([]),
};

/** Fecha de hoy en UTC, la que usa la captura. */
const TODAY = new Date().toISOString().slice(0, 10);

describe('PortfolioSnapshotsService (integración con Postgres)', () => {
  let db: Database;
  let close: () => Promise<void>;
  let snapshots: PortfolioSnapshotsService;
  let positions: PositionsService;

  beforeAll(() => {
    ({ db, close } = createTestDb());
    const prices = new PricesService(db, silentProvider, identityResolver);
    const lots = new PositionLotsService(db);
    positions = new PositionsService(db, prices, lots);
    snapshots = new PortfolioSnapshotsService(db, new PortfolioValuationService(positions, prices), prices);
  });

  afterEach(async () => {
    await resetDb(db);
  });

  afterAll(async () => {
    await close();
  });

  /** Cachea un cierre para un símbolo, como haría el refresco diario. */
  async function cachePrice(symbol: string, close_: string, currency: string): Promise<void> {
    await db
      .insert(instrumentPrices)
      .values({ symbol, date: TODAY, close: close_, currency, source: 'test' });
  }

  it('guarda la valoración en EUR junto con las tasas FX del día', async () => {
    const userId = await insertUser(db, 'a@example.com');
    await positions.create(userId, { ticker: 'IWDA', quantity: 10, avgPrice: 100 });
    await cachePrice('IWDA', '120', 'EUR');
    // Tasa EUR→USD del día: la que permitirá reexpresar el histórico más adelante.
    await cachePrice('EURUSD=X', '1.10', 'USD');

    await snapshots.captureUser(userId);

    const [row] = await db.select().from(portfolioSnapshots);
    expect(row).toMatchObject({
      userId,
      date: TODAY,
      invested: '1000.00000000',
      marketValue: '1200.00000000',
      valuedPositions: 1,
      totalPositions: 1,
    });
    expect(row.fxRates).toMatchObject({ USD: 1, EUR: 1.1 });
  });

  it('es idempotente: capturar dos veces el mismo día ACTUALIZA la fila, no la duplica', async () => {
    const userId = await insertUser(db, 'a@example.com');
    await positions.create(userId, { ticker: 'IWDA', quantity: 10, avgPrice: 100 });
    await cachePrice('IWDA', '120', 'EUR');

    await snapshots.captureAll();
    // El precio sube entre una ejecución y otra: la segunda debe sobrescribir.
    await db.update(instrumentPrices).set({ close: '130' });
    const summary = await snapshots.captureAll();

    const rows = await db.select().from(portfolioSnapshots);
    expect(rows).toHaveLength(1);
    expect(rows[0].marketValue).toBe('1300.00000000');
    expect(summary).toMatchObject({ users: 1, captured: 1, failed: 0 });
  });

  it('omite a los usuarios sin posiciones (no ensucia la serie con filas a cero)', async () => {
    await insertUser(db, 'sin-cartera@example.com');

    const summary = await snapshots.captureAll();

    expect(summary).toMatchObject({ users: 0, captured: 0, failed: 0 });
    expect(await db.select().from(portfolioSnapshots)).toHaveLength(0);
  });

  it('un usuario que falla no impide capturar los del resto', async () => {
    const ok = await insertUser(db, 'ok@example.com');
    const broken = await insertUser(db, 'roto@example.com');
    await positions.create(ok, { ticker: 'IWDA', quantity: 10, avgPrice: 100 });
    // Valoración desbordada (10¹² · 10¹²): no cabe en numeric(20,8) y hace fallar SU captura.
    await positions.create(broken, {
      ticker: 'HUGE',
      quantity: 999_999_999_999,
      avgPrice: 999_999_999_999,
    });
    await cachePrice('IWDA', '120', 'EUR');
    await cachePrice('HUGE', '1', 'EUR');

    const summary = await snapshots.captureAll();

    expect(summary).toMatchObject({ users: 2, captured: 1, failed: 1 });
    const rows = await db.select().from(portfolioSnapshots);
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe(ok);
  });

  describe('history', () => {
    /** Inserta un snapshot ya cerrado, como los que habría dejado el cron días atrás. */
    async function seedSnapshot(
      userId: string,
      date: string,
      invested: string,
      marketValue: string,
      fxRates: Record<string, number>,
    ): Promise<void> {
      await db.insert(portfolioSnapshots).values({
        userId,
        date,
        invested,
        marketValue,
        valuedPositions: 1,
        totalPositions: 1,
        fxRates,
      });
    }

    /** Fecha de hace `days` días, en UTC. */
    const daysAgo = (days: number): string =>
      new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

    it('devuelve la serie en EUR, de la más antigua a la más reciente, con su P&L', async () => {
      const userId = await insertUser(db, 'a@example.com');
      await seedSnapshot(userId, daysAgo(2), '1000', '1100', { USD: 1, EUR: 1.1 });
      await seedSnapshot(userId, daysAgo(1), '1000', '1200', { USD: 1, EUR: 1.2 });

      const history = await snapshots.history(userId, 30);

      expect(history.base).toBe('EUR');
      expect(history.points.map((p) => p.marketValue)).toEqual([1100, 1200]);
      expect(history.points[1]).toMatchObject({ pnlAbs: 200, pnlPct: 20 });
    });

    it('reexpresa cada punto con las tasas de SU día, no con las de hoy', async () => {
      const userId = await insertUser(db, 'a@example.com');
      await seedSnapshot(userId, daysAgo(2), '1000', '1000', { USD: 1, EUR: 1.1 });
      await seedSnapshot(userId, daysAgo(1), '1000', '1000', { USD: 1, EUR: 1.2 });

      const history = await snapshots.history(userId, 30, 'USD');

      expect(history.display).toBe('USD');
      // Mismo importe en EUR, distinto en USD: es justo lo que permite guardar las tasas.
      expect(history.points.map((p) => p.marketValue)).toEqual([1100, 1200]);
    });

    it('deja el punto en null si aquel día no había tasa para la divisa pedida', async () => {
      const userId = await insertUser(db, 'a@example.com');
      await seedSnapshot(userId, daysAgo(1), '1000', '1000', { USD: 1, EUR: 1.1 });

      const history = await snapshots.history(userId, 30, 'JPY');

      expect(history.points).toHaveLength(1);
      expect(history.points[0]).toMatchObject({ invested: null, marketValue: null, pnlAbs: null });
    });

    it('respeta la ventana de días y no devuelve lo anterior', async () => {
      const userId = await insertUser(db, 'a@example.com');
      await seedSnapshot(userId, daysAgo(40), '1000', '1000', { USD: 1, EUR: 1.1 });
      await seedSnapshot(userId, daysAgo(2), '1000', '1200', { USD: 1, EUR: 1.1 });

      const history = await snapshots.history(userId, 7);

      expect(history.points).toHaveLength(1);
      expect(history.points[0].date).toBe(daysAgo(2));
    });

    it('solo devuelve la serie del propio usuario', async () => {
      const userA = await insertUser(db, 'a@example.com');
      const userB = await insertUser(db, 'b@example.com');
      await seedSnapshot(userA, daysAgo(1), '1000', '1100', { USD: 1, EUR: 1.1 });

      expect((await snapshots.history(userB, 30)).points).toHaveLength(0);
      expect((await snapshots.history(userA, 30)).points).toHaveLength(1);
    });
  });
});
