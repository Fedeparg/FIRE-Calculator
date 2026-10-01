import { EventEmitter2 } from '@nestjs/event-emitter';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Database } from '../db/database.module.js';
import { instrumentPrices, instrumentSplits, portfolioSnapshots, positionLots } from '../db/schema.js';
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
  getHistory: () => Promise.resolve({ quotes: [], splits: [] }),
};

/** Fecha de hoy en UTC, la que usa la captura (con el reloj congelado: ver `beforeEach`). */
const today = (): string => new Date().toISOString().slice(0, 10);

describe('PortfolioSnapshotsService (integración con Postgres)', () => {
  let db: Database;
  let close: () => Promise<void>;
  let snapshots: PortfolioSnapshotsService;
  let positions: PositionsService;

  beforeAll(() => {
    ({ db, close } = createTestDb());
    const prices = new PricesService(db, silentProvider, identityResolver);
    const lots = new PositionLotsService(db, new EventEmitter2());
    positions = new PositionsService(db, prices, lots, new EventEmitter2());
    snapshots = new PortfolioSnapshotsService(
      db,
      new PortfolioValuationService(positions, prices),
      prices,
      positions,
    );
  });

  // Reloj congelado (solo `Date`): una ejecución que cruce la medianoche UTC no debe cambiar el
  // "hoy" a mitad de un test, ni dejar desfasadas las fechas relativas (`daysAgo`).
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

  /** Cachea un cierre para un símbolo, como haría el refresco diario. */
  async function cachePrice(symbol: string, close_: string, currency: string): Promise<void> {
    await cachePriceOn(symbol, today(), close_, currency);
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

  /** Fecha de hace `days` días, en UTC. */
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
      date: today(),
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
    /**
     * Alta de una posición con su lote inicial FECHADO en `tradedAt` (el alta normal lo fecha
     * hoy): así se parte de una cartera con historia, como la de una importación de bróker.
     */
    async function createBoughtOn(
      userId: string,
      ticker: string,
      quantity: number,
      avgPrice: number,
      tradedAt: string,
      currency: 'EUR' | 'USD' = 'EUR',
    ): Promise<string> {
      const { id } = await positions.create(userId, { ticker, quantity, avgPrice, currency });
      await db.update(positionLots).set({ tradedAt }).where(eq(positionLots.positionId, id));
      return id;
    }

    /** Añade una operación a una posición, por BD (el orden de creación desempata el mismo día). */
    async function addLot(
      userId: string,
      positionId: string,
      kind: 'buy' | 'sell',
      quantity: string,
      price: string,
      tradedAt: string,
    ): Promise<void> {
      await db.insert(positionLots).values({ positionId, userId, kind, quantity, price, tradedAt });
    }

    async function rowsOf(userId: string) {
      return db
        .select()
        .from(portfolioSnapshots)
        .where(eq(portfolioSnapshots.userId, userId))
        .orderBy(portfolioSnapshots.date);
    }

    it('reconstruye desde la primera operación con la cantidad de CADA día, no la actual', async () => {
      const userId = await insertUser(db, 'a@example.com');
      const id = await createBoughtOn(userId, 'IWDA', 10, 100, daysAgo(5));
      await addLot(userId, id, 'buy', '10', '120', daysAgo(3));
      for (const days of [6, 5, 4, 3, 2, 1]) await cachePriceOn('IWDA', daysAgo(days), '100', 'EUR');

      await snapshots.backfillUser(userId);

      const rows = await rowsOf(userId);
      // Nada antes de la primera compra (hace 5 días): el cierre de hace 6 días no genera fila.
      expect(rows.map((r) => r.date)).toEqual([5, 4, 3, 2, 1].map(daysAgo));
      // 10 uds hasta la segunda compra, 20 después.
      expect(rows.map((r) => r.marketValue)).toEqual([
        '1000.00000000',
        '1000.00000000',
        '2000.00000000',
        '2000.00000000',
        '2000.00000000',
      ]);
      // Coste a la cantidad de cada día: 10·100, y 10·100 + 10·120 tras la segunda compra.
      expect(rows.map((r) => r.invested)).toEqual([
        '1000.00000000',
        '1000.00000000',
        '2200.00000000',
        '2200.00000000',
        '2200.00000000',
      ]);
      expect(rows.every((r) => r.estimated)).toBe(true);
    });

    it('llega más atrás que una semana y no rellena huecos largos de precio con un cierre rancio', async () => {
      const userId = await insertUser(db, 'a@example.com');
      await createBoughtOn(userId, 'IWDA', 10, 100, daysAgo(400));
      for (const days of [400, 399, 200, 100, 1]) {
        await cachePriceOn('IWDA', daysAgo(days), '100', 'EUR');
      }

      await snapshots.backfillUser(userId);

      // Cada cierre cubre su día y los 10 siguientes (margen de arrastre); el resto, hueco.
      const covered = (from: number, to: number) => Array.from({ length: from - to + 1 }, (_, i) => daysAgo(from - i));
      expect((await rowsOf(userId)).map((r) => r.date)).toEqual([
        ...covered(400, 389), // cierres de hace 400 y 399 días
        ...covered(200, 190),
        ...covered(100, 90),
        daysAgo(1),
      ]);
    });

    it('tras una venta total no hay snapshot, y reaparece con la recompra', async () => {
      const userId = await insertUser(db, 'a@example.com');
      const id = await createBoughtOn(userId, 'IWDA', 10, 100, daysAgo(5));
      await addLot(userId, id, 'sell', '10', '110', daysAgo(3));
      await addLot(userId, id, 'buy', '4', '90', daysAgo(1));
      for (const days of [5, 4, 3, 2, 1]) await cachePriceOn('IWDA', daysAgo(days), '100', 'EUR');

      await snapshots.backfillUser(userId);

      expect((await rowsOf(userId)).map((r) => r.date)).toEqual([daysAgo(5), daysAgo(4), daysAgo(1)]);
    });

    it('un día sin tasa EUR para una posición en USD se omite; con tasa, se convierte', async () => {
      const userId = await insertUser(db, 'a@example.com');
      await createBoughtOn(userId, 'AAPL', 1, 100, daysAgo(4), 'USD');
      for (const days of [3, 2]) await cachePriceOn('AAPL', daysAgo(days), '200', 'USD');
      // La tasa EUR aparece solo desde hace 2 días.
      await cachePriceOn('EURUSD=X', daysAgo(2), '1.25', 'USD');

      await snapshots.backfillUser(userId);

      const rows = await rowsOf(userId);
      expect(rows.map((r) => r.date)).toEqual([daysAgo(2), daysAgo(1)]);
      expect(Number(rows[0].marketValue)).toBeCloseTo(160, 6); // 200 USD / 1,25
      expect(rows[0].fxRates).toMatchObject({ USD: 1, EUR: 1.25 });
    });

    it('nunca escribe una fila para HOY: es responsabilidad exclusiva de la captura real', async () => {
      const userId = await insertUser(db, 'a@example.com');
      await createBoughtOn(userId, 'IWDA', 10, 100, daysAgo(2));
      await cachePriceOn('IWDA', daysAgo(1), '100', 'EUR');
      // Precio de HOY disponible: si el backfill lo incluyera, escribiría una fila
      // `estimated: true` para hoy aunque el cron nocturno aún no haya capturado el día real.
      await cachePrice('IWDA', '999', 'EUR');

      await snapshots.backfillUser(userId);

      expect((await rowsOf(userId)).some((r) => r.date === today())).toBe(false);
    });

    it('nunca pisa una captura real ya existente', async () => {
      const userId = await insertUser(db, 'a@example.com');
      await createBoughtOn(userId, 'IWDA', 10, 100, daysAgo(3));
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

      await snapshots.backfillUser(userId);

      const [row] = (await rowsOf(userId)).filter((r) => r.date === daysAgo(1));
      expect(row.marketValue).toBe('999.00000000');
      expect(row.estimated).toBe(false);
    });

    it('SÍ refina una estimación anterior con mejores datos', async () => {
      const userId = await insertUser(db, 'a@example.com');
      await createBoughtOn(userId, 'IWDA', 10, 100, daysAgo(3));
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

      await snapshots.backfillUser(userId);

      const [row] = await rowsOf(userId);
      expect(row.marketValue).toBe('1500.00000000');
      expect(row.estimated).toBe(true);
    });

    it('retira las estimaciones sin base (anteriores a la primera operación) de un backfill antiguo', async () => {
      const userId = await insertUser(db, 'a@example.com');
      await createBoughtOn(userId, 'IWDA', 10, 100, daysAgo(2));
      // Fila que el backfill antiguo (cantidad de hoy aplicada a días previos a la compra) escribió.
      await db.insert(portfolioSnapshots).values({
        userId,
        date: daysAgo(6),
        invested: '1000.00000000',
        marketValue: '1000.00000000',
        valuedPositions: 1,
        totalPositions: 1,
        fxRates: { USD: 1 },
        estimated: true,
      });
      await cachePriceOn('IWDA', daysAgo(2), '100', 'EUR');

      await snapshots.backfillUser(userId);

      expect((await rowsOf(userId)).map((r) => r.date)).toEqual([daysAgo(2), daysAgo(1)]);
    });

    it('si la reconstrucción sale vacía no borra las estimaciones existentes', async () => {
      const userId = await insertUser(db, 'a@example.com');
      await createBoughtOn(userId, 'SINDATOS', 10, 100, daysAgo(3));
      await db.insert(portfolioSnapshots).values({
        userId,
        date: daysAgo(2),
        invested: '1000.00000000',
        marketValue: '1000.00000000',
        valuedPositions: 1,
        totalPositions: 1,
        fxRates: { USD: 1 },
        estimated: true,
      });

      await snapshots.backfillUser(userId);

      expect(await rowsOf(userId)).toHaveLength(1);
    });

    it('sin ningún precio disponible no escribe fila (no inventa un dato)', async () => {
      const userId = await insertUser(db, 'a@example.com');
      await createBoughtOn(userId, 'SINDATOS', 10, 100, daysAgo(3));

      await snapshots.backfillUser(userId);

      expect(await rowsOf(userId)).toHaveLength(0);
    });

    it('una posición recién dada de alta (lote de hoy) no genera historia', async () => {
      const userId = await insertUser(db, 'a@example.com');
      await positions.create(userId, { ticker: 'IWDA', quantity: 10, avgPrice: 100 });
      await cachePriceOn('IWDA', daysAgo(3), '100', 'EUR');

      await snapshots.backfillUser(userId);

      expect(await rowsOf(userId)).toHaveLength(0);
    });

    it('es idempotente: reconstruir dos veces deja las mismas filas', async () => {
      const userId = await insertUser(db, 'a@example.com');
      await createBoughtOn(userId, 'IWDA', 10, 100, daysAgo(3));
      for (const days of [3, 2, 1]) await cachePriceOn('IWDA', daysAgo(days), '100', 'EUR');

      await snapshots.backfillUser(userId);
      await snapshots.backfillUser(userId);

      expect(await rowsOf(userId)).toHaveLength(3);
    });

    it('escribe una serie larga (más filas que el tamaño de bloque) sin perder días', async () => {
      const userId = await insertUser(db, 'a@example.com');
      await createBoughtOn(userId, 'IWDA', 10, 100, daysAgo(450));
      await db.insert(instrumentPrices).values(
        Array.from({ length: 450 }, (_, i) => ({
          symbol: 'IWDA',
          date: daysAgo(450 - i),
          close: '100',
          currency: 'EUR',
          source: 'test',
        })),
      );

      await snapshots.backfillUser(userId);

      const rows = await rowsOf(userId);
      expect(rows).toHaveLength(450);
      expect(rows[0].date).toBe(daysAgo(450));
      expect(rows.at(-1)?.date).toBe(daysAgo(1));
    });

    it('corrige un split: la cantidad cruda se expresa en acciones de hoy y no hay salto', async () => {
      const userId = await insertUser(db, 'a@example.com');
      // 10 acciones compradas a 1000 antes de un split 10:1; Yahoo da los cierres ya ajustados (100).
      await createBoughtOn(userId, 'NVDA', 10, 1000, daysAgo(6));
      for (const days of [5, 4, 3, 2, 1]) await cachePriceOn('NVDA', daysAgo(days), '100', 'EUR');
      await db.insert(instrumentSplits).values({ symbol: 'NVDA', date: daysAgo(3), ratio: '10' });

      await snapshots.backfillUser(userId);

      const rows = await rowsOf(userId);
      expect(rows.map((r) => r.marketValue)).toEqual(Array<string>(5).fill('10000.00000000'));
      expect(rows.map((r) => r.invested)).toEqual(Array<string>(5).fill('10000.00000000'));
    });

    it('una estimada entre dos reales se actualiza sin tocar las reales, y la sobrante se retira', async () => {
      const userId = await insertUser(db, 'a@example.com');
      await createBoughtOn(userId, 'IWDA', 10, 100, daysAgo(6));
      for (const days of [6, 5, 4, 3, 2, 1]) await cachePriceOn('IWDA', daysAgo(days), '150', 'EUR');
      const seed = (days: number, marketValue: string, estimated: boolean) =>
        db.insert(portfolioSnapshots).values({
          userId,
          date: daysAgo(days),
          invested: '1000.00000000',
          marketValue,
          valuedPositions: 1,
          totalPositions: 1,
          fxRates: { USD: 1 },
          estimated,
        });
      await seed(5, '999.00000000', false); // real
      await seed(4, '1.00000000', true); // estimada desfasada entre reales
      await seed(3, '998.00000000', false); // real
      await seed(20, '1.00000000', true); // estimada sobrante (antes de la primera operación)

      await snapshots.backfillUser(userId);

      const rows = await rowsOf(userId);
      const byDate = Object.fromEntries(rows.map((r) => [r.date, r]));
      expect(byDate[daysAgo(5)]).toMatchObject({ marketValue: '999.00000000', estimated: false });
      expect(byDate[daysAgo(3)]).toMatchObject({ marketValue: '998.00000000', estimated: false });
      expect(byDate[daysAgo(4)]).toMatchObject({ marketValue: '1500.00000000', estimated: true });
      expect(byDate[daysAgo(20)]).toBeUndefined();
    });

    it('una segunda pasada sin cambios no reescribe ninguna fila', async () => {
      const userId = await insertUser(db, 'a@example.com');
      await createBoughtOn(userId, 'IWDA', 10, 100, daysAgo(3));
      for (const days of [3, 2, 1]) await cachePriceOn('IWDA', daysAgo(days), '100', 'EUR');
      await snapshots.backfillUser(userId);
      const before = await rowsOf(userId);

      await new Promise((resolve) => setTimeout(resolve, 20));
      vi.setSystemTime(new Date(Date.now() + 60_000)); // `updatedAt` cambiaría si se reescribiese
      await snapshots.backfillUser(userId);

      expect((await rowsOf(userId)).map((r) => r.updatedAt)).toEqual(before.map((r) => r.updatedAt));
    });

    it('dos reconstrucciones concurrentes del mismo usuario no se pisan', async () => {
      const userId = await insertUser(db, 'a@example.com');
      await createBoughtOn(userId, 'IWDA', 10, 100, daysAgo(3));
      for (const days of [3, 2, 1]) await cachePriceOn('IWDA', daysAgo(days), '100', 'EUR');

      await Promise.all([snapshots.backfillUser(userId), snapshots.backfillUser(userId)]);

      expect(await rowsOf(userId)).toHaveLength(3);
    });

    it('backfillAll omite a los usuarios sin posiciones, igual que captureAll', async () => {
      await insertUser(db, 'sin-cartera@example.com');

      await snapshots.backfillAll();

      expect(await db.select().from(portfolioSnapshots)).toHaveLength(0);
    });

    it('backfillAll respalda a todos los usuarios con posiciones', async () => {
      const a = await insertUser(db, 'a@example.com');
      const b = await insertUser(db, 'b@example.com');
      await createBoughtOn(a, 'IWDA', 10, 100, daysAgo(3));
      await createBoughtOn(b, 'IWDA', 5, 100, daysAgo(3));
      await cachePriceOn('IWDA', daysAgo(1), '100', 'EUR');

      await snapshots.backfillAll();

      const rows = await db.select().from(portfolioSnapshots);
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
    it('reconstruye el histórico del usuario del evento', async () => {
      const userId = await insertUser(db, 'a@example.com');
      const { id } = await positions.create(userId, { ticker: 'IWDA', quantity: 10, avgPrice: 100 });
      await db.update(positionLots).set({ tradedAt: daysAgo(3) }).where(eq(positionLots.positionId, id));
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

  describe('onLotChanged', () => {
    it('reconstruye la evolución tras añadir un lote con fecha anterior', async () => {
      const userId = await insertUser(db, 'a@example.com');
      const { id } = await positions.create(userId, { ticker: 'IWDA', quantity: 10, avgPrice: 100 });
      for (const days of [5, 4, 3, 2, 1]) await cachePriceOn('IWDA', daysAgo(days), '100', 'EUR');
      await db.insert(positionLots).values({
        positionId: id,
        userId,
        kind: 'buy',
        quantity: '5',
        price: '90',
        tradedAt: daysAgo(4),
      });

      await snapshots.onLotChanged({ userId, positionId: id });

      const rows = await db.select().from(portfolioSnapshots).where(eq(portfolioSnapshots.userId, userId));
      expect(rows.map((r) => r.date).sort()).toEqual([4, 3, 2, 1].map(daysAgo).sort());
    });

    it('un fallo no se propaga', async () => {
      await expect(
        snapshots.onLotChanged({ userId: '00000000-0000-0000-0000-000000000000', positionId: '00000000-0000-0000-0000-000000000000' }),
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
