import { createHash } from 'node:crypto';

import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { SESSION_COOKIE } from '@sextante/core/contracts';
import cookieParser from 'cookie-parser';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, inject, it, vi } from 'vitest';

import type { Env } from '../config/env.js';
import type { Database } from '../db/database.module.js';
import { loginTokens, users } from '../db/schema.js';
import { DevEmailService } from '../email/dev-email.service.js';
import { createTestDb, insertUser, resetDb } from '../../test/db.js';
import { disableStartupBackfill, waitForStartupJobs } from '../../test/startup-jobs.js';
import { SESSION_TTL_SECONDS } from './session.constants.js';

/**
 * `AppModule` se importa en diferido: `ConfigModule.forRoot({ validate })` valida el entorno al
 * evaluar el módulo, y estos tests fijan el suyo en `beforeAll`, es decir, después de los imports.
 */
const loadAppModule = async () => (await import('../app.module.js')).AppModule;

const SECRET = 'test-secret-para-el-controller-de-auth';
const APP_URL = 'https://sextante.example.test';

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

/** Arranca la app completa (misma configuración que `main.ts`, sin MCP) en un puerto libre. */
async function bootApp(): Promise<{ app: NestExpressApplication; baseUrl: string }> {
  const app = await NestFactory.create<NestExpressApplication>(await loadAppModule(), {
    abortOnError: false,
    logger: false,
  });
  // Como en producción: se confía en el primer proxy, así `X-Forwarded-For` fija la IP del
  // cliente. Los tests lo usan para no compartir el cupo de throttling de `/auth/request`.
  app.set('trust proxy', 1);
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  await app.listen(0, '127.0.0.1');
  return { app, baseUrl: `${await app.getUrl()}/api/auth` };
}

let nextClientIp = 1;

/** POST JSON desde una IP de cliente "nueva" (o la indicada), vía `X-Forwarded-For`. */
function postJson(url: string, body: unknown, clientIp = `10.0.0.${nextClientIp++}`): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': clientIp },
    body: JSON.stringify(body),
  });
}

/** Cabecera `Set-Cookie` de la cookie de sesión (o undefined si la respuesta no la toca). */
function sessionSetCookie(res: Response): string | undefined {
  return res.headers.getSetCookie().find((cookie) => cookie.startsWith(`${SESSION_COOKIE}=`));
}

/** Valor de la cookie de sesión de una cabecera `Set-Cookie`. */
function cookieValue(setCookie: string): string {
  return setCookie.split(';')[0].slice(SESSION_COOKIE.length + 1);
}

describe('AuthController (HTTP)', () => {
  const original = { ...process.env };
  let app: NestExpressApplication;
  let baseUrl: string;
  let db: Database;
  let closeDb: () => Promise<void>;
  /** Enlaces mágicos "enviados": el transporte de dev se sustituye para capturarlos. */
  let sentLinks: { to: string; link: string }[];

  /** Token en claro del último enlace enviado (el que llegaría al buzón del usuario). */
  const lastToken = (): string => {
    const link = sentLinks.at(-1)?.link;
    if (!link) throw new Error('No se envió ningún enlace');
    return new URL(link).searchParams.get('token') ?? '';
  };

  /**
   * Cambia `COOKIE_SECURE` con la app ya arrancada. La configuración validada se congela al
   * importar `AppModule`, así que tocar `process.env` ya no surte efecto: se intercepta la lectura.
   */
  const stubCookieSecure = (secure: boolean): void => {
    const config = app.get<ConfigService<Env, true>>(ConfigService);
    const realGet = config.get.bind(config) as unknown as (key: string, ...rest: unknown[]) => unknown;
    vi.spyOn(config, 'get').mockImplementation(((key: string, ...rest: unknown[]) =>
      key === 'COOKIE_SECURE' ? secure : realGet(key, ...rest)) as typeof config.get);
  };

  /** Pide un enlace por la ruta real y devuelve su token en claro. */
  const requestToken = async (email: string): Promise<string> => {
    const res = await postJson(`${baseUrl}/request`, { email });
    expect(res.status).toBe(202);
    return lastToken();
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = inject('databaseUrl');
    process.env.JWT_SECRET = SECRET;
    process.env.EMAIL_TRANSPORT = 'dev';
    process.env.EMAIL_FROM = 'Sextante <no-reply@example.test>';
    process.env.APP_URL = APP_URL;
    // Los crons no deben interbloquearse con el TRUNCATE de `resetDb` (ver imports.controller.test).
    process.env.PRICE_REFRESH_CRON = '0 0 4 1 1 *';
    process.env.PRICE_INTRADAY_CRON = 'off';
    delete process.env.COOKIE_SECURE;

    ({ db, close: closeDb } = createTestDb());
    disableStartupBackfill();
    ({ app, baseUrl } = await bootApp());
    await waitForStartupJobs(app);
  });

  beforeEach(async () => {
    await resetDb(db);
    sentLinks = [];
    vi.spyOn(DevEmailService.prototype, 'sendMagicLink').mockImplementation((to, link) => {
      sentLinks.push({ to, link });
      return Promise.resolve();
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await app.close();
    await resetDb(db);
    await closeDb();
    process.env = original;
  });

  describe('POST /auth/request', () => {
    it('responde 202 con el mismo cuerpo exista o no el email (sin enumeración de usuarios)', async () => {
      await insertUser(db, 'existe@example.com');

      const known = await postJson(`${baseUrl}/request`, { email: 'existe@example.com' });
      const unknown = await postJson(`${baseUrl}/request`, { email: 'nuevo@example.com' });

      expect(known.status).toBe(202);
      expect(unknown.status).toBe(202);
      expect(await known.json()).toEqual({ ok: true });
      expect(await unknown.json()).toEqual({ ok: true });
      // Ambos reciben enlace: la respuesta no distingue entre cuenta nueva y existente.
      expect(sentLinks.map((s) => s.to)).toEqual(['existe@example.com', 'nuevo@example.com']);
    });

    it('no crea el usuario al pedir el enlace: se crea al verificarlo', async () => {
      await postJson(`${baseUrl}/request`, { email: 'nuevo@example.com' });

      expect(await db.select().from(users)).toHaveLength(0);
    });

    it('guarda solo el hash del token, con caducidad de 15 minutos', async () => {
      const before = Date.now();
      const token = await requestToken('a@example.com');

      const [row] = await db.select().from(loginTokens);
      expect(row.tokenHash).toBe(sha256(token));
      expect(row.tokenHash).not.toContain(token);
      expect(row.consumedAt).toBeNull();
      const ttl = row.expiresAt.getTime() - before;
      expect(ttl).toBeGreaterThan(14 * 60_000);
      expect(ttl).toBeLessThanOrEqual(15 * 60_000 + 5_000);
      // El enlace apunta al frontend público.
      expect(sentLinks[0].link.startsWith(`${APP_URL}/auth/verify?token=`)).toBe(true);
    });

    it('normaliza el email a minúsculas antes de guardarlo y enviarlo', async () => {
      await postJson(`${baseUrl}/request`, { email: 'A@Example.COM' });

      expect(sentLinks[0].to).toBe('a@example.com');
      const [row] = await db.select().from(loginTokens);
      expect(row.email).toBe('a@example.com');
    });

    it('rechaza un email no válido con 400 y no envía nada', async () => {
      const res = await postJson(`${baseUrl}/request`, { email: 'no-es-un-email' });

      expect(res.status).toBe(400);
      expect(sentLinks).toHaveLength(0);
    });

    it('genera un token distinto en cada petición', async () => {
      const first = await requestToken('a@example.com');
      const second = await requestToken('a@example.com');

      expect(second).not.toBe(first);
    });
  });

  describe('POST /auth/verify', () => {
    it('crea el usuario en el primer login y abre sesión con una cookie', async () => {
      const token = await requestToken('Nuevo@Example.com');

      const res = await postJson(`${baseUrl}/verify`, { token });

      expect(res.status).toBe(200);
      const [user] = await db.select().from(users);
      expect(user.email).toBe('nuevo@example.com');
      expect(await res.json()).toEqual({ id: user.id, email: 'nuevo@example.com' });
      expect(sessionSetCookie(res)).toBeDefined();
    });

    it('reutiliza el usuario existente en logins posteriores (no duplica)', async () => {
      const id = await insertUser(db, 'a@example.com');
      const token = await requestToken('a@example.com');

      const res = await postJson(`${baseUrl}/verify`, { token });

      expect(((await res.json()) as { id: string }).id).toBe(id);
      expect(await db.select().from(users)).toHaveLength(1);
    });

    it('el token es de un solo uso: reutilizarlo devuelve 401 y no abre sesión', async () => {
      const token = await requestToken('a@example.com');
      expect((await postJson(`${baseUrl}/verify`, { token })).status).toBe(200);

      const again = await postJson(`${baseUrl}/verify`, { token });

      expect(again.status).toBe(401);
      expect(sessionSetCookie(again)).toBeUndefined();
    });

    it('dos canjes simultáneos del mismo token: solo uno gana', async () => {
      const token = await requestToken('a@example.com');

      const results = await Promise.all([
        postJson(`${baseUrl}/verify`, { token }),
        postJson(`${baseUrl}/verify`, { token }),
      ]);

      expect(results.map((r) => r.status).sort()).toEqual([200, 401]);
    });

    it('un token caducado devuelve 401 y no crea el usuario', async () => {
      const token = await requestToken('a@example.com');
      await db
        .update(loginTokens)
        .set({ expiresAt: new Date(Date.now() - 1_000) })
        .where(eq(loginTokens.tokenHash, sha256(token)));

      const res = await postJson(`${baseUrl}/verify`, { token });

      expect(res.status).toBe(401);
      expect(await db.select().from(users)).toHaveLength(0);
    });

    it('un token inexistente (bien formado) devuelve 401', async () => {
      const res = await postJson(`${baseUrl}/verify`, { token: 'x'.repeat(43) });

      expect(res.status).toBe(401);
    });

    it('un token mal formado (demasiado corto o ausente) devuelve 400', async () => {
      expect((await postJson(`${baseUrl}/verify`, { token: 'corto' })).status).toBe(400);
      expect((await postJson(`${baseUrl}/verify`, {})).status).toBe(400);
    });

    it('el usuario creado es el del enlace canjeado, no el de otro enlace pendiente', async () => {
      const tokenA = await requestToken('a@example.com');
      await requestToken('b@example.com');

      const res = await postJson(`${baseUrl}/verify`, { token: tokenA });

      expect(((await res.json()) as { email: string }).email).toBe('a@example.com');
    });
  });

  describe('cookie de sesión y JWT', () => {
    it('la cookie es HttpOnly, SameSite=Lax, de path / y dura 7 días', async () => {
      const token = await requestToken('a@example.com');

      const setCookie = sessionSetCookie(await postJson(`${baseUrl}/verify`, { token }));

      expect(setCookie).toBeDefined();
      expect(setCookie).toMatch(/;\s*HttpOnly/i);
      expect(setCookie).toMatch(/;\s*SameSite=Lax/i);
      expect(setCookie).toMatch(/;\s*Path=\//i);
      expect(setCookie).toContain(`Max-Age=${SESSION_TTL_SECONDS}`);
    });

    it('no es Secure por defecto (permite servir a un frontend en http://localhost)', async () => {
      const token = await requestToken('a@example.com');

      const setCookie = sessionSetCookie(await postJson(`${baseUrl}/verify`, { token }));

      expect(setCookie).not.toMatch(/;\s*Secure/i);
    });

    it('es Secure cuando COOKIE_SECURE=true', async () => {
      stubCookieSecure(true);
      const token = await requestToken('a@example.com');

      const setCookie = sessionSetCookie(await postJson(`${baseUrl}/verify`, { token }));

      expect(setCookie).toMatch(/;\s*Secure/i);
    });

    it('no es Secure con COOKIE_SECURE=false', async () => {
      stubCookieSecure(false);
      const token = await requestToken('a@example.com');

      const setCookie = sessionSetCookie(await postJson(`${baseUrl}/verify`, { token }));

      expect(setCookie).not.toMatch(/;\s*Secure/i);
    });

    it('el JWT lleva sub y email, está firmado con JWT_SECRET y caduca a los 7 días', async () => {
      const token = await requestToken('a@example.com');
      const res = await postJson(`${baseUrl}/verify`, { token });
      const user = (await res.json()) as { id: string; email: string };
      const jwt = cookieValue(sessionSetCookie(res) ?? '');

      const payload = await new JwtService({ secret: SECRET }).verifyAsync<{
        sub: string;
        email: string;
        iat: number;
        exp: number;
      }>(jwt);

      expect(payload.sub).toBe(user.id);
      expect(payload.email).toBe('a@example.com');
      expect(payload.exp - payload.iat).toBe(SESSION_TTL_SECONDS);
      await expect(new JwtService({ secret: 'otro-secreto' }).verifyAsync(jwt)).rejects.toThrow();
    });
  });

  describe('GET /auth/me', () => {
    it('devuelve el usuario con una sesión obtenida por el flujo real', async () => {
      const token = await requestToken('a@example.com');
      const login = await postJson(`${baseUrl}/verify`, { token });
      const user = (await login.json()) as { id: string; email: string };
      const jwt = cookieValue(sessionSetCookie(login) ?? '');

      const res = await fetch(`${baseUrl}/me`, { headers: { Cookie: `${SESSION_COOKIE}=${jwt}` } });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual(user);
    });

    it('devuelve 401 sin cookie', async () => {
      expect((await fetch(`${baseUrl}/me`)).status).toBe(401);
    });

    it('devuelve 401 con un JWT firmado con otro secreto', async () => {
      const id = await insertUser(db, 'a@example.com');
      const forged = await new JwtService({ secret: 'otro-secreto' }).signAsync({ sub: id, email: 'a@example.com' });

      const res = await fetch(`${baseUrl}/me`, { headers: { Cookie: `${SESSION_COOKIE}=${forged}` } });

      expect(res.status).toBe(401);
    });

    it('devuelve 401 con un JWT caducado', async () => {
      const id = await insertUser(db, 'a@example.com');
      const expired = await new JwtService({ secret: SECRET }).signAsync(
        { sub: id, email: 'a@example.com' },
        { expiresIn: -10 },
      );

      const res = await fetch(`${baseUrl}/me`, { headers: { Cookie: `${SESSION_COOKIE}=${expired}` } });

      expect(res.status).toBe(401);
    });

    it('devuelve 401 con un JWT manipulado', async () => {
      const id = await insertUser(db, 'a@example.com');
      const valid = await new JwtService({ secret: SECRET }).signAsync({ sub: id, email: 'a@example.com' });
      const tampered = `${valid.slice(0, -4)}AAAA`;

      const res = await fetch(`${baseUrl}/me`, { headers: { Cookie: `${SESSION_COOKIE}=${tampered}` } });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /auth/account/export', () => {
    // La lógica vive en `account/`, pero la ruta es contrato público (la consume el frontend).
    it('exige sesión', async () => {
      expect((await fetch(`${baseUrl}/account/export`)).status).toBe(401);
    });

    it('descarga los datos del usuario como adjunto JSON', async () => {
      const id = await insertUser(db, 'a@example.com');
      const jwt = await new JwtService({ secret: SECRET }).signAsync({ sub: id, email: 'a@example.com' });

      const res = await fetch(`${baseUrl}/account/export`, { headers: { Cookie: `${SESSION_COOKIE}=${jwt}` } });

      expect(res.status).toBe(200);
      expect(res.headers.get('content-disposition')).toBe('attachment; filename="sextante-datos.json"');
      expect(await res.json()).toMatchObject({
        email: 'a@example.com',
        positions: [],
        positionLots: [],
        portfolioHistory: [],
        savedScenarios: [],
        connectedApps: [],
        notificationSettings: { fireAlertsEnabled: false },
      });
    });
  });

  describe('POST /auth/logout', () => {
    it('borra la cookie de sesión (caducada y vacía, con los mismos atributos)', async () => {
      const res = await postJson(`${baseUrl}/logout`, {});

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
      const setCookie = sessionSetCookie(res);
      expect(setCookie).toBeDefined();
      expect(cookieValue(setCookie ?? '')).toBe('');
      expect(setCookie).toMatch(/Expires=Thu, 01 Jan 1970/i);
      expect(setCookie).toMatch(/;\s*HttpOnly/i);
      expect(setCookie).toMatch(/;\s*Path=\//i);
    });
  });

  describe('throttling de /auth/request', () => {
    it('permite 5 peticiones por minuto desde la misma IP y rechaza la sexta con 429', async () => {
      const ip = '192.0.2.50';
      for (let i = 0; i < 5; i += 1) {
        expect((await postJson(`${baseUrl}/request`, { email: 'a@example.com' }, ip)).status).toBe(202);
      }

      const sixth = await postJson(`${baseUrl}/request`, { email: 'a@example.com' }, ip);

      expect(sixth.status).toBe(429);
      // Otra IP no comparte el cupo.
      expect((await postJson(`${baseUrl}/request`, { email: 'a@example.com' }, '192.0.2.51')).status).toBe(202);
    });
  });
});
