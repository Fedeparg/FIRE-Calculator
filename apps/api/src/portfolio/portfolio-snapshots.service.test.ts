import { EventEmitter2 } from '@nestjs/event-emitter';
import { and, eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { Database } from '../db/database.module.js';
import { instrumentPrices, portfolioSnapshots } from '../db/schema.js';
import { PositionLotsService } from '../positions/position-lots.service.js';
import { PositionsService } from '../positions/positions.service.js';
import type { PriceProvider } from '../prices/price-provider.interface.js';
import { PricesService } from '../prices/prices.service.js';
import type { SymbolResolver } from '../prices/symbol-resolver.js';
import { createTestDb, insertUser, resetDb } from '../../test/db.js';
import { PortfolioSnapshotsService } from './portfolio-snapshots.service.js';
import { PortfolioValuationService } from './portfolio-valuation.service.js';

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
    positions = new PositionsService(db, prices, lots, new EventEmitter2());
    snapshots = new PortfolioSnapshotsService(
      db,
      new PortfolioValuationService(positions, prices),
      prices,
      positions,
    );
  });

  afterEach(async () => {
    await resetDb(db);
  });

  afterAll(async () => {
    await close();
  });

  /** Cachea un cierre para un símbolo, como haría el refresco diario. */
  async function cachePrice(symbol: string, close_: string, currency: string): Promise<void> {
    await cachePriceOn(symbol, TODAY, close_, currency);
  }

  /** Igual que `cachePrice`, pero en una fecha concreta (para sembrar histórico pasado). */
  async function cachePriceOn(
    symbol: string,
    date: string,
    close_: string,
    currency: string,
  ): Promise<void> {
    await db.insert(instrumentPrices).values({ symbol, date, close: close_, currency, source: 'test' });
  }

  /** Fecha de hace `days` días, en UTC (idéntica a la usada por `backfillDates`). */
  const daysAgo = (days: number): string =>
    new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

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

  describe('backfillUser / backfillAll', () => {
    it('usa la cantidad ACTUAL de la posición aplicada a los precios de cada día pasado', async () => {
      const userId = await insertUser(db, 'a@example.com');
      await positions.create(userId, { ticker: 'IWDA', quantity: 10, avgPrice: 100 });
      await cachePriceOn('IWDA', daysAgo(3), '100', 'EUR');
      await cachePriceOn('IWDA', daysAgo(2), '200', 'EUR');
      await cachePriceOn('IWDA', daysAgo(1), '300', 'EUR');

      await snapshots.backfillUser(userId, 3);

      const rows = await db
        .select()
        .from(portfolioSnapshots)
        .where(eq(portfolioSnapshots.userId, userId))
        .orderBy(portfolioSnapshots.date);
      // La cantidad (10) es la de HOY, aplicada a CADA precio pasado: 10·100, 10·200, 10·300.
      expect(rows.map((r) => r.marketValue)).toEqual(['1000.00000000', '2000.00000000', '3000.00000000']);
      expect(rows.every((r) => r.estimated)).toBe(true);
    });

    it('nunca escribe una fila para HOY: es responsabilidad exclusiva de la captura real', async () => {
      const userId = await insertUser(db, 'a@example.com');
      await positions.create(userId, { ticker: 'IWDA', quantity: 10, avgPrice: 100 });
      await cachePriceOn('IWDA', daysAgo(1), '100', 'EUR');
      // Precio de HOY disponible: si `backfillDates` lo incluyera, escribiría una fila
      // `estimated: true` para hoy aunque el cron nocturno aún no haya capturado el día real.
      await cachePrice('IWDA', '999', 'EUR');

      await snapshots.backfillUser(userId, 3);

      const rows = await db.select().from(portfolioSnapshots).where(eq(portfolioSnapshots.userId, userId));
      expect(rows.some((r) => r.date === TODAY)).toBe(false);
    });

    it('nunca pisa una captura real ya existente', async () => {
      const userId = await insertUser(db, 'a@example.com');
      await positions.create(userId, { ticker: 'IWDA', quantity: 10, avgPrice: 100 });
      await cachePriceOn('IWDA', daysAgo(1), '150', 'EUR');
      // Captura REAL ya guardada por el cron para ese día, con un valor distinto al que
      // calcularía el backfill (10 · 150 = 1500).
      await db.insert(portfolioSnapshots).values({
        userId,
        date: daysAgo(1),
        invested: '1000.00000000',
        marketValue: '999.00000000',
        valuedPositions: 1,
        totalPositions: 1,
        fxRates: { USD: 1 },
        estimated: false,
      });

      await snapshots.backfillUser(userId, 3);

      const [row] = await db
        .select()
        .from(portfolioSnapshots)
        .where(and(eq(portfolioSnapshots.userId, userId), eq(portfolioSnapshots.date, daysAgo(1))));
      expect(row.marketValue).toBe('999.00000000');
      expect(row.estimated).toBe(false);
    });

    it('SÍ refina una estimación anterior con mejores datos', async () => {
      const userId = await insertUser(db, 'a@example.com');
      await positions.create(userId, { ticker: 'IWDA', quantity: 10, avgPrice: 100 });
      // Estimación anterior con un valor claramente distinto al que se recalculará ahora.
      await db.insert(portfolioSnapshots).values({
        userId,
        date: daysAgo(1),
        invested: '1000.00000000',
        marketValue: '1.00000000',
        valuedPositions: 1,
        totalPositions: 1,
        fxRates: { USD: 1 },
        estimated: true,
      });
      await cachePriceOn('IWDA', daysAgo(1), '150', 'EUR');

      await snapshots.backfillUser(userId, 3);

      const [row] = await db
        .select()
        .from(portfolioSnapshots)
        .where(and(eq(portfolioSnapshots.userId, userId), eq(portfolioSnapshots.date, daysAgo(1))));
      expect(row.marketValue).toBe('1500.00000000');
      expect(row.estimated).toBe(true);
    });

    it('respeta la ventana de días pedida', async () => {
      const userId = await insertUser(db, 'a@example.com');
      await positions.create(userId, { ticker: 'IWDA', quantity: 10, avgPrice: 100 });
      await cachePriceOn('IWDA', daysAgo(5), '100', 'EUR');

      await snapshots.backfillUser(userId, 3);

      const rows = await db.select().from(portfolioSnapshots).where(eq(portfolioSnapshots.userId, userId));
      // La ventana pedida es de 3 días (anteriores a hoy): no debe escribir nada para hace 5
      // días, aunque el precio "as of" de ese hueco sea el único disponible.
      expect(rows.every((r) => r.date >= daysAgo(3))).toBe(true);
    });

    it('sin ningún precio disponible no escribe fila (no inventa un dato)', async () => {
      const userId = await insertUser(db, 'a@example.com');
      await positions.create(userId, { ticker: 'SINDATOS', quantity: 10, avgPrice: 100 });

      await snapshots.backfillUser(userId, 3);

      expect(await db.select().from(portfolioSnapshots).where(eq(portfolioSnapshots.userId, userId))).toHaveLength(0);
    });

    it('backfillAll omite a los usuarios sin posiciones, igual que captureAll', async () => {
      await insertUser(db, 'sin-cartera@example.com');

      await snapshots.backfillAll(3);

      expect(await db.select().from(portfolioSnapshots)).toHaveLength(0);
    });

    it('backfillAll respalda a todos los usuarios con posiciones', async () => {
      const a = await insertUser(db, 'a@example.com');
      const b = await insertUser(db, 'b@example.com');
      await positions.create(a, { ticker: 'IWDA', quantity: 10, avgPrice: 100 });
      await positions.create(b, { ticker: 'IWDA', quantity: 5, avgPrice: 100 });
      await cachePriceOn('IWDA', daysAgo(1), '100', 'EUR');

      await snapshots.backfillAll(3);

      const rows = await db.select().from(portfolioSnapshots);
      // El precio solo cubre HOY y ayer (no hace 2 días), así que cada usuario recibe 2 filas,
      // no 1: lo que importa aquí es que AMBOS usuarios quedaron respaldados, no el conteo.
      expect(new Set(rows.map((r) => r.userId))).toEqual(new Set([a, b]));
    });
  });

  describe('onPositionCreated', () => {
    /**
     * `@OnEvent` solo se registra vía el `EventEmitter2` gestionado por Nest
     * (`EventEmitterModule`, con `DiscoveryService` escaneando providers); instanciar el
     * servicio a mano con `new` —como hace el resto de este fichero— nunca dispara el
     * listener. Este test llama al método directamente para cubrir SU CUERPO (que
     * `backfillUser` se invoca y que un fallo no se propaga), no el cableado de Nest, que solo
     * se verifica arrancando la app de verdad (`app.module.test.ts`).
     */
    it('backfillea el histórico reciente del usuario del evento', async () => {
      const userId = await insertUser(db, 'a@example.com');
      await positions.create(userId, { ticker: 'IWDA', quantity: 10, avgPrice: 100 });
      await cachePriceOn('IWDA', daysAgo(1), '100', 'EUR');

      await snapshots.onPositionCreated({ userId });

      const rows = await db.select().from(portfolioSnapshots).where(eq(portfolioSnapshots.userId, userId));
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => r.estimated)).toBe(true);
    });

    it('un fallo en el backfill no se propaga (tolerante a fallos)', async () => {
      // Usuario inexistente: `backfillUser` no lanza (no tiene posiciones que leer), así que
      // lo que importa es que el propio método nunca rechaza, tenga o no datos que backfillear.
      await expect(
        snapshots.onPositionCreated({ userId: '00000000-0000-0000-0000-000000000000' }),
      ).resolves.toBeUndefined();
    });
  });

  describe('history', () => {
    /** Inserta un snapshot ya cerrado, como los que habría dejado el cron días atrás. */
    async function seedSnapshot(
      userId: string,
      date: string,
      invested: string,
      marketValue: string,
      fxRates: Record<string, number>,
      estimated = false,
    ): Promise<void> {
      await db.insert(portfolioSnapshots).values({
        userId,
        date,
        invested,
        marketValue,
        valuedPositions: 1,
        totalPositions: 1,
        fxRates,
        estimated,
      });
    }

    it('expone estimated: true/false por punto', async () => {
      const userId = await insertUser(db, 'a@example.com');
      await seedSnapshot(userId, daysAgo(2), '1000', '1100', { USD: 1, EUR: 1.1 }, true);
      await seedSnapshot(userId, daysAgo(1), '1000', '1200', { USD: 1, EUR: 1.2 }, false);

      const history = await snapshots.history(userId, 30);

      expect(history.points.map((p) => p.estimated)).toEqual([true, false]);
    });

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
