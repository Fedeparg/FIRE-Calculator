import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { Database } from '../db/database.module';
import { instrumentPrices } from '../db/schema';
import { createTestDb, resetDb } from '../../test/db';
import { HealthController } from './health.controller';

const HOUR = 3_600_000;

describe('HealthController (integración con Postgres)', () => {
  let db: Database;
  let close: () => Promise<void>;
  let controller: HealthController;

  beforeAll(() => {
    ({ db, close } = createTestDb());
    controller = new HealthController(db);
  });

  afterEach(async () => {
    await resetDb(db);
  });

  afterAll(async () => {
    await close();
  });

  /** Inserta un cierre con la antigüedad de obtención indicada. */
  async function insertPrice(opts: { date: string; fetchedHoursAgo: number }): Promise<void> {
    await db.insert(instrumentPrices).values({
      symbol: 'EUNL.DE',
      date: opts.date,
      close: '100.00000000',
      currency: 'EUR',
      source: 'yahoo',
      fetchedAt: new Date(Date.now() - opts.fetchedHoursAgo * HOUR),
    });
  }

  it('informa de versión y uptime', async () => {
    const health = await controller.check();

    expect(health.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(health.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(health.uptimeSeconds)).toBe(true);
    expect(health.database).toBe('up');
    expect(() => new Date(health.timestamp).toISOString()).not.toThrow();
  });

  it('sin cotizaciones todavía: ok, sin edad y sin marcar rancio', async () => {
    const health = await controller.check();

    expect(health.status).toBe('ok');
    expect(health.prices).toEqual({
      lastDate: null,
      lastFetchedAt: null,
      ageHours: null,
      stale: false,
    });
  });

  it('con un refresco reciente: ok, con la fecha del dato y la edad en horas', async () => {
    await insertPrice({ date: '2026-09-01', fetchedHoursAgo: 2 });

    const health = await controller.check();

    expect(health.status).toBe('ok');
    expect(health.prices.lastDate).toBe('2026-09-01');
    expect(health.prices.ageHours).toBeCloseTo(2, 1);
    expect(health.prices.stale).toBe(false);
    expect(health.prices.lastFetchedAt).not.toBeNull();
  });

  it('marca degraded cuando el último refresco supera el umbral', async () => {
    await insertPrice({ date: '2026-08-01', fetchedHoursAgo: 48 });

    const health = await controller.check();

    expect(health.status).toBe('degraded');
    expect(health.prices.stale).toBe(true);
    expect(health.prices.ageHours).toBeCloseTo(48, 1);
    // Degradado, pero SIN excepción: el healthcheck de Docker debe seguir viendo un 200.
    expect(health.database).toBe('up');
  });

  it('toma el dato más reciente cuando hay varios símbolos y fechas', async () => {
    await insertPrice({ date: '2026-08-20', fetchedHoursAgo: 100 });
    await db.insert(instrumentPrices).values({
      symbol: 'AAPL',
      date: '2026-09-02',
      close: '200.00000000',
      currency: 'USD',
      source: 'yahoo',
      fetchedAt: new Date(Date.now() - HOUR),
    });

    const health = await controller.check();

    expect(health.prices.lastDate).toBe('2026-09-02');
    expect(health.prices.ageHours).toBeCloseTo(1, 1);
    expect(health.status).toBe('ok');
  });
});
