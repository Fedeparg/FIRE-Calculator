import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { MAX_IMPORT_BYTES } from '@sextante/core/imports/limits';
import { TRADE_REPUBLIC_HEADER } from '@sextante/core/imports/trade-republic';
import cookieParser from 'cookie-parser';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it, vi } from 'vitest';

import { AppModule } from '../app.module.js';
import { SESSION_COOKIE } from '@sextante/core/contracts';
import type { Database } from '../db/database.module.js';
import { positions } from '../db/schema.js';
import { createTestDb, insertUser, resetDb } from '../../test/db.js';

const SECRET = 'test-secret-para-el-controller-de-imports';
const HEADER = TRADE_REPUBLIC_HEADER.map((column) => `"${column}"`).join(',');

/** Un export mínimo y sintético con una sola compra. */
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
 * Prueba la capa HTTP real (guard, límite de tamaño, tipo de contenido, throttling) contra la
 * aplicación completa: es lo único que los tests del servicio, que lo instancian a mano, no
 * pueden ver.
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
    // El intradía salta a cada media hora: coincidiendo con un test, su lectura se interbloqueaba
    // con el TRUNCATE de `resetDb` (fallo que dependía de la hora a la que corría la suite).
    process.env.PRICE_INTRADAY_CRON = 'off';
    // Sin red: el arranque y el refresco de precios tras importar llamarían a Yahoo.
    global.fetch = vi.fn().mockRejectedValue(new Error('red deshabilitada en este test'));

    ({ db, close: closeDb } = createTestDb());

    app = await NestFactory.create(AppModule, { abortOnError: false, logger: false });
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.setGlobalPrefix('api');
    await app.listen(0, '127.0.0.1');
    baseUrl = `${await app.getUrl()}/api/imports/trade-republic`;
    // Se llama a la API por `127.0.0.1` con el `fetch` real, no con el stub de arriba.
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
    // Los ficheros de test comparten BD: no dejar el usuario de este para el siguiente.
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

  it('exige sesión en preview y confirm (401) y no escribe nada', async () => {
    expect((await post('preview', { cookie: null })).status).toBe(401);
    expect((await post('confirm', { cookie: null })).status).toBe(401);
    expect(await db.select().from(positions)).toEqual([]);
  });

  it('rechaza un tipo de contenido que no es text/csv (415)', async () => {
    expect((await post('preview', { type: 'application/json', body: '{}' })).status).toBe(415);
  });

  it('rechaza un cuerpo por encima de 2 MB (413)', async () => {
    const response = await post('preview', { body: 'x'.repeat(MAX_IMPORT_BYTES + 1) });
    expect(response.status).toBe(413);
  });

  it('rechaza un cuerpo vacío y un fichero ajeno con 400 y código', async () => {
    const empty = await post('preview', { body: '' });
    expect(empty.status).toBe(400);
    const foreign = await post('preview', { body: 'a,b\n1,2\n' });
    expect(foreign.status).toBe(400);
    expect(await foreign.json()).toMatchObject({ code: 'NOT_TRADE_REPUBLIC' });
  });

  it('preview devuelve el plan sin escribir y confirm lo aplica de forma idempotente', async () => {
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

  it('limita las peticiones por minuto (429)', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      statuses.push((await post('preview', { body: 'a,b\n1,2\n' })).status);
    }
    expect(statuses).toContain(429);
  });
});
