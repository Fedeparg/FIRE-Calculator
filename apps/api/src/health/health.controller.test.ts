import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { Database } from '../db/database.module.js';
import { instrumentPrices } from '../db/schema.js';
import { createTestDb, resetDb } from '../../test/db.js';
import { HealthController } from './health.controller.js';

const HOUR = 3_600_000;

describe('HealthController (Postgres integration)', () => {
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

  /** Inserts a close fetched the given number of hours ago. */
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

  it('reports version and uptime', async () => {
    const health = await controller.check();

    expect(health.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(health.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(health.uptimeSeconds)).toBe(true);
    expect(health.database).toBe('up');
    expect(() => new Date(health.timestamp).toISOString()).not.toThrow();
  });

  it('with no quotes yet: ok, no age and not flagged stale', async () => {
    const health = await controller.check();

    expect(health.status).toBe('ok');
    expect(health.prices).toEqual({
      lastDate: null,
      lastFetchedAt: null,
      ageHours: null,
      stale: false,
    });
  });

  it('with a recent refresh: ok, with the data date and the age in hours', async () => {
    await insertPrice({ date: '2026-09-01', fetchedHoursAgo: 2 });

    const health = await controller.check();

    expect(health.status).toBe('ok');
    expect(health.prices.lastDate).toBe('2026-09-01');
    expect(health.prices.ageHours).toBeCloseTo(2, 1);
    expect(health.prices.stale).toBe(false);
    expect(health.prices.lastFetchedAt).not.toBeNull();
  });

  it('reports degraded when the last refresh exceeds the threshold', async () => {
    await insertPrice({ date: '2026-08-01', fetchedHoursAgo: 48 });

    const health = await controller.check();

    expect(health.status).toBe('degraded');
    expect(health.prices.stale).toBe(true);
    expect(health.prices.ageHours).toBeCloseTo(48, 1);
    // Degraded, but WITHOUT an exception: the Docker healthcheck must still see a 200.
    expect(health.database).toBe('up');
  });

  it('takes the most recent data point across several symbols and dates', async () => {
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
