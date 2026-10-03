import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { MAX_IMPORT_BYTES } from '@sextante/core/imports/limits';
import { TRADE_REPUBLIC_HEADER } from '@sextante/core/imports/trade-republic';
import cookieParser from 'cookie-parser';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it, vi } from 'vitest';

import { SESSION_COOKIE } from '@sextante/core/contracts';
import type { Database } from '../db/database.module.js';
import { positions } from '../db/schema.js';
import { createTestDb, insertUser, resetDb } from '../../test/db.js';
import { disableStartupBackfill, waitForStartupJobs } from '../../test/startup-jobs.js';

/**
 * `AppModule` is imported lazily: `ConfigModule.forRoot({ validate })` validates the environment
 * when the module is evaluated, and these tests set theirs in `beforeAll`, i.e. after the imports.
 */
const loadAppModule = async () => (await import('../app.module.js')).AppModule;

const SECRET = 'test-secret-for-the-imports-controller';
const HEADER = TRADE_REPUBLIC_HEADER.map((column) => `"${column}"`).join(',');

/** A minimal, synthetic export with a single buy. */
const ONE_BUY = `${HEADER}\n${TRADE_REPUBLIC_HEADER.map((column) => {
  const values: Record<string, string> = {
    datetime: '2025-03-03T10:00:00.123456Z',
    date: '2025-03-03',
    type: 'BUY',
    asset_class: 'FUND',
    name: 'Example World ETF Acc',
    symbol: 'ZZ00EXAMPL01',
    shares: '2',
    price: '100',
    currency: 'EUR',
    transaction_id: '00000000-0000-0000-0000-00000000aaaa',
  };
  return `"${values[column] ?? ''}"`;
}).join(',')}\n`;

/**
 * Exercises the real HTTP layer (guard, size limit, content type, throttling) against the full
 * application: the one thing the service tests, which instantiate it by hand, cannot see.
 */
describe('ImportsController (HTTP)', () => {
  const original = { ...process.env };
  const realFetch = global.fetch;
  let app: INestApplication;
  let baseUrl: string;
  let db: Database;
  let closeDb: () => Promise<void>;
  let cookie: string;
  let userId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = inject('databaseUrl');
    process.env.JWT_SECRET = SECRET;
    process.env.EMAIL_TRANSPORT = 'dev';
    process.env.EMAIL_FROM = 'Sextante <no-reply@example.test>';
    process.env.APP_URL = 'https://sextante.example.test';
    process.env.PRICE_REFRESH_CRON = '0 0 4 1 1 *';
    // The intraday job fires every half hour: when it overlapped a test, its read deadlocked with
    // the `resetDb` TRUNCATE (a failure that depended on the time the suite ran).
    process.env.PRICE_INTRADAY_CRON = 'off';
    // No network: startup and the post-import price refresh would call Yahoo.
    global.fetch = vi.fn().mockRejectedValue(new Error('network disabled in this test'));

    ({ db, close: closeDb } = createTestDb());
    disableStartupBackfill();

    app = await NestFactory.create(await loadAppModule(), { abortOnError: false, logger: false });
    app.use(cookieParser());
    app.setGlobalPrefix('api');
    await app.listen(0, '127.0.0.1');
    // Without this, the first TRUNCATE could deadlock with the background startup pass.
    await waitForStartupJobs(app);
    baseUrl = `${await app.getUrl()}/api/imports/trade-republic`;
    // The API is called on `127.0.0.1` with the real `fetch`, not the stub above.
    global.fetch = realFetch;
  });

  beforeEach(async () => {
    await resetDb(db);
    userId = await insertUser(db, 'a@example.com');
    const token = await new JwtService({ secret: SECRET }).signAsync({ sub: userId, email: 'a@example.com' });
    cookie = `${SESSION_COOKIE}=${token}`;
  });

  afterAll(async () => {
    await app.close();
    // Test files share the database: do not leave this file's user behind for the next one.
    await resetDb(db);
    await closeDb();
    process.env = original;
  });

  function post(path: 'preview' | 'confirm', init: { body?: string; type?: string; cookie?: string | null }) {
    return fetch(`${baseUrl}/${path}`, {
      method: 'POST',
      headers: {
        ...(init.type === undefined ? { 'content-type': 'text/csv' } : { 'content-type': init.type }),
        ...(init.cookie === null ? {} : { cookie: init.cookie ?? cookie }),
      },
      body: init.body ?? ONE_BUY,
    });
  }

  it('requires a session on preview and confirm (401) and writes nothing', async () => {
    expect((await post('preview', { cookie: null })).status).toBe(401);
    expect((await post('confirm', { cookie: null })).status).toBe(401);
    expect(await db.select().from(positions)).toEqual([]);
  });

  it('rejects a content type other than text/csv (415)', async () => {
    expect((await post('preview', { type: 'application/json', body: '{}' })).status).toBe(415);
  });

  it('rejects a body over 2 MB (413)', async () => {
    const response = await post('preview', { body: 'x'.repeat(MAX_IMPORT_BYTES + 1) });
    expect(response.status).toBe(413);
  });

  it('rejects an empty body and a foreign file with 400 and a code', async () => {
    const empty = await post('preview', { body: '' });
    expect(empty.status).toBe(400);
    const foreign = await post('preview', { body: 'a,b\n1,2\n' });
    expect(foreign.status).toBe(400);
    expect(await foreign.json()).toMatchObject({ code: 'NOT_TRADE_REPUBLIC' });
  });

  it('preview returns the plan without writing and confirm applies it idempotently', async () => {
    const preview = await post('preview', {});
    expect(preview.status).toBe(200);
    expect(await preview.json()).toMatchObject({
      broker: 'Trade Republic',
      positions: [{ isin: 'ZZ00EXAMPL01', action: 'create', newBuys: 1, resultingQuantity: 2 }],
    });
    expect(await db.select().from(positions)).toEqual([]);

    const first = await post('confirm', {});
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ totals: { lotsCreated: 1, duplicates: 0, failedPositions: 0 } });
    expect(await db.select().from(positions).where(eq(positions.userId, userId))).toHaveLength(1);

    const second = await post('confirm', {});
    expect(await second.json()).toMatchObject({ totals: { lotsCreated: 0, duplicates: 1 } });
  });

  it('rate-limits requests per minute (429)', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      statuses.push((await post('preview', { body: 'a,b\n1,2\n' })).status);
    }
    expect(statuses).toContain(429);
  });
});
