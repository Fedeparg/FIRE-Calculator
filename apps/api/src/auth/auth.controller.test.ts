import { createHash } from 'node:crypto';

import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { firstItem, itemAt } from '@sextante/core/arrays';
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
 * `AppModule` is imported lazily: `ConfigModule.forRoot({ validate })` validates the environment when
 * the module is evaluated, and these tests set theirs in `beforeAll`, i.e. after the imports.
 */
const loadAppModule = async () => (await import('../app.module.js')).AppModule;

const SECRET = 'test-secret-for-the-auth-controller';
const APP_URL = 'https://sextante.example.test';

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

/** Boots the full app (same setup as `main.ts`, without MCP) on a free port. */
async function bootApp(): Promise<{ app: NestExpressApplication; baseUrl: string }> {
  const app = await NestFactory.create<NestExpressApplication>(await loadAppModule(), {
    abortOnError: false,
    logger: false,
  });
  // As in production: the first proxy is trusted, so `X-Forwarded-For` sets the client IP.
  // The tests rely on it so they do not share the `/auth/request` throttling quota.
  app.set('trust proxy', 1);
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  await app.listen(0, '127.0.0.1');
  return { app, baseUrl: `${await app.getUrl()}/api/auth` };
}

let nextClientIp = 1;

/** POSTs JSON from a "fresh" client IP (or the given one), via `X-Forwarded-For`. */
function postJson(url: string, body: unknown, clientIp = `10.0.0.${nextClientIp++}`): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': clientIp },
    body: JSON.stringify(body),
  });
}

/** `Set-Cookie` header of the session cookie (or undefined if the response does not touch it). */
function sessionSetCookie(res: Response): string | undefined {
  return res.headers.getSetCookie().find((cookie) => cookie.startsWith(`${SESSION_COOKIE}=`));
}

/** Session cookie value from a `Set-Cookie` header. */
function cookieValue(setCookie: string): string {
  return itemAt(setCookie.split(';'), 0).slice(SESSION_COOKIE.length + 1);
}

describe('AuthController (HTTP)', () => {
  const original = { ...process.env };
  let app: NestExpressApplication;
  let baseUrl: string;
  let db: Database;
  let closeDb: () => Promise<void>;
  /** "Sent" magic links: the dev transport is stubbed to capture them. */
  let sentLinks: { to: string; link: string; locale: string }[];

  /** Plain token of the last link sent (the one that would reach the user's inbox). */
  const lastToken = (): string => {
    const link = sentLinks.at(-1)?.link;
    if (!link) throw new Error('No link was sent');
    return new URL(link).searchParams.get('token') ?? '';
  };

  /**
   * Changes `COOKIE_SECURE` with the app already running. The validated config is frozen when
   * `AppModule` is imported, so touching `process.env` no longer has any effect: the read is intercepted.
   */
  const stubCookieSecure = (secure: boolean): void => {
    const config = app.get<ConfigService<Env, true>>(ConfigService);
    const realGet = config.get.bind(config) as unknown as (key: string, ...rest: unknown[]) => unknown;
    vi.spyOn(config, 'get').mockImplementation(((key: string, ...rest: unknown[]) =>
      key === 'COOKIE_SECURE' ? secure : realGet(key, ...rest)) as typeof config.get);
  };

  /** Requests a link through the real route and returns its plain token. */
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
    // The crons must not deadlock with the TRUNCATE in `resetDb` (see imports.controller.test).
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
    vi.spyOn(DevEmailService.prototype, 'sendMagicLink').mockImplementation((to, link, locale) => {
      sentLinks.push({ to, link, locale });
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
    it('responds 202 with the same body whether or not the email exists (no user enumeration)', async () => {
      await insertUser(db, 'existing@example.com');

      const known = await postJson(`${baseUrl}/request`, { email: 'existing@example.com' });
      const unknown = await postJson(`${baseUrl}/request`, { email: 'new@example.com' });

      expect(known.status).toBe(202);
      expect(unknown.status).toBe(202);
      expect(await known.json()).toEqual({ ok: true });
      expect(await unknown.json()).toEqual({ ok: true });
      // Both get a link: the response does not distinguish a new account from an existing one.
      expect(sentLinks.map((s) => s.to)).toEqual(['existing@example.com', 'new@example.com']);
    });

    it('limits links per email even when the IP changes: the 4th within 15 min is 202 but not sent', async () => {
      const statuses: number[] = [];
      for (let i = 0; i < 4; i++) {
        // Each request from a different IP: the per-IP limit does not apply, the per-email one does.
        statuses.push((await postJson(`${baseUrl}/request`, { email: 'victim@example.com' })).status);
      }

      expect(statuses).toEqual([202, 202, 202, 202]);
      expect(sentLinks).toHaveLength(3);
      expect(await db.select().from(loginTokens)).toHaveLength(3);
      // Another address does not share the quota.
      await postJson(`${baseUrl}/request`, { email: 'other@example.com' });
      expect(sentLinks).toHaveLength(4);
    });

    it('does not create the user when the link is requested: it is created on verification', async () => {
      await postJson(`${baseUrl}/request`, { email: 'new@example.com' });

      expect(await db.select().from(users)).toHaveLength(0);
    });

    it('stores only the token hash, with a 15-minute expiry', async () => {
      const before = Date.now();
      const token = await requestToken('a@example.com');

      const row = firstItem(await db.select().from(loginTokens));
      expect(row.tokenHash).toBe(sha256(token));
      expect(row.tokenHash).not.toContain(token);
      expect(row.consumedAt).toBeNull();
      const ttl = row.expiresAt.getTime() - before;
      expect(ttl).toBeGreaterThan(14 * 60_000);
      expect(ttl).toBeLessThanOrEqual(15 * 60_000 + 5_000);
      // The link points to the public frontend.
      expect(itemAt(sentLinks, 0).link.startsWith(`${APP_URL}/auth/verify?token=`)).toBe(true);
    });

    it('lower-cases the email before storing and sending it', async () => {
      await postJson(`${baseUrl}/request`, { email: 'A@Example.COM' });

      expect(itemAt(sentLinks, 0).to).toBe('a@example.com');
      const row = firstItem(await db.select().from(loginTokens));
      expect(row.email).toBe('a@example.com');
    });

    it('sends the link in the requested language (Spanish by default), pointing to that locale', async () => {
      await postJson(`${baseUrl}/request`, { email: 'a@example.com' });
      await postJson(`${baseUrl}/request`, { email: 'b@example.com', locale: 'en' });

      expect(sentLinks.map((sent) => sent.locale)).toEqual(['es', 'en']);
      expect(itemAt(sentLinks, 0).link.startsWith(`${APP_URL}/auth/verify?token=`)).toBe(true);
      expect(itemAt(sentLinks, 1).link.startsWith(`${APP_URL}/en/auth/verify?token=`)).toBe(true);
    });

    it('rejects an unsupported language with 400', async () => {
      const res = await postJson(`${baseUrl}/request`, { email: 'a@example.com', locale: 'fr' });

      expect(res.status).toBe(400);
      expect(sentLinks).toHaveLength(0);
    });

    it('rejects an invalid email with 400 and sends nothing', async () => {
      const res = await postJson(`${baseUrl}/request`, { email: 'not-an-email' });

      expect(res.status).toBe(400);
      expect(sentLinks).toHaveLength(0);
    });

    it('generates a different token on every request', async () => {
      const first = await requestToken('a@example.com');
      const second = await requestToken('a@example.com');

      expect(second).not.toBe(first);
    });
  });

  describe('POST /auth/verify', () => {
    it('creates the user on first login and opens a session with a cookie', async () => {
      const token = await requestToken('New@Example.com');

      const res = await postJson(`${baseUrl}/verify`, { token });

      expect(res.status).toBe(200);
      const user = firstItem(await db.select().from(users));
      expect(user.email).toBe('new@example.com');
      expect(await res.json()).toEqual({ id: user.id, email: 'new@example.com' });
      expect(sessionSetCookie(res)).toBeDefined();
    });

    it('reuses the existing user on later logins (no duplicate)', async () => {
      const id = await insertUser(db, 'a@example.com');
      const token = await requestToken('a@example.com');

      const res = await postJson(`${baseUrl}/verify`, { token });

      expect(((await res.json()) as { id: string }).id).toBe(id);
      expect(await db.select().from(users)).toHaveLength(1);
    });

    it('the token is single-use: reusing it returns 401 and opens no session', async () => {
      const token = await requestToken('a@example.com');
      expect((await postJson(`${baseUrl}/verify`, { token })).status).toBe(200);

      const again = await postJson(`${baseUrl}/verify`, { token });

      expect(again.status).toBe(401);
      expect(sessionSetCookie(again)).toBeUndefined();
    });

    it('two concurrent redemptions of the same token: only one wins', async () => {
      const token = await requestToken('a@example.com');

      const results = await Promise.all([
        postJson(`${baseUrl}/verify`, { token }),
        postJson(`${baseUrl}/verify`, { token }),
      ]);

      expect(results.map((r) => r.status).sort()).toEqual([200, 401]);
    });

    it('an expired token returns 401 and does not create the user', async () => {
      const token = await requestToken('a@example.com');
      await db
        .update(loginTokens)
        .set({ expiresAt: new Date(Date.now() - 1_000) })
        .where(eq(loginTokens.tokenHash, sha256(token)));

      const res = await postJson(`${baseUrl}/verify`, { token });

      expect(res.status).toBe(401);
      expect(await db.select().from(users)).toHaveLength(0);
    });

    it('an unknown (well-formed) token returns 401', async () => {
      const res = await postJson(`${baseUrl}/verify`, { token: 'x'.repeat(43) });

      expect(res.status).toBe(401);
    });

    it('a malformed token (too short or missing) returns 400', async () => {
      expect((await postJson(`${baseUrl}/verify`, { token: 'short' })).status).toBe(400);
      expect((await postJson(`${baseUrl}/verify`, {})).status).toBe(400);
    });

    it('the created user is the one of the redeemed link, not of another pending link', async () => {
      const tokenA = await requestToken('a@example.com');
      await requestToken('b@example.com');

      const res = await postJson(`${baseUrl}/verify`, { token: tokenA });

      expect(((await res.json()) as { email: string }).email).toBe('a@example.com');
    });
  });

  describe('session cookie and JWT', () => {
    it('the cookie is HttpOnly, SameSite=Lax, path / and lasts 7 days', async () => {
      const token = await requestToken('a@example.com');

      const setCookie = sessionSetCookie(await postJson(`${baseUrl}/verify`, { token }));

      expect(setCookie).toBeDefined();
      expect(setCookie).toMatch(/;\s*HttpOnly/i);
      expect(setCookie).toMatch(/;\s*SameSite=Lax/i);
      expect(setCookie).toMatch(/;\s*Path=\//i);
      expect(setCookie).toContain(`Max-Age=${SESSION_TTL_SECONDS}`);
    });

    it('is not Secure by default (allows serving a frontend on http://localhost)', async () => {
      const token = await requestToken('a@example.com');

      const setCookie = sessionSetCookie(await postJson(`${baseUrl}/verify`, { token }));

      expect(setCookie).not.toMatch(/;\s*Secure/i);
    });

    it('is Secure when COOKIE_SECURE=true', async () => {
      stubCookieSecure(true);
      const token = await requestToken('a@example.com');

      const setCookie = sessionSetCookie(await postJson(`${baseUrl}/verify`, { token }));

      expect(setCookie).toMatch(/;\s*Secure/i);
    });

    it('is not Secure with COOKIE_SECURE=false', async () => {
      stubCookieSecure(false);
      const token = await requestToken('a@example.com');

      const setCookie = sessionSetCookie(await postJson(`${baseUrl}/verify`, { token }));

      expect(setCookie).not.toMatch(/;\s*Secure/i);
    });

    it('the JWT carries sub and email, is signed with JWT_SECRET and expires after 7 days', async () => {
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
      // The user's session version at signing time (0 for a newly created user).
      expect(payload).toHaveProperty('ver', 0);
      expect(payload.exp - payload.iat).toBe(SESSION_TTL_SECONDS);
      await expect(new JwtService({ secret: 'other-secret' }).verifyAsync(jwt)).rejects.toThrow();
    });
  });

  describe('GET /auth/me', () => {
    it('returns the user with a session obtained through the real flow', async () => {
      const token = await requestToken('a@example.com');
      const login = await postJson(`${baseUrl}/verify`, { token });
      const user = (await login.json()) as { id: string; email: string };
      const jwt = cookieValue(sessionSetCookie(login) ?? '');

      const res = await fetch(`${baseUrl}/me`, { headers: { Cookie: `${SESSION_COOKIE}=${jwt}` } });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual(user);
    });

    it('returns 401 without a cookie', async () => {
      expect((await fetch(`${baseUrl}/me`)).status).toBe(401);
    });

    it('returns 401 with a JWT signed with another secret', async () => {
      const id = await insertUser(db, 'a@example.com');
      const forged = await new JwtService({ secret: 'other-secret' }).signAsync({ sub: id, email: 'a@example.com' });

      const res = await fetch(`${baseUrl}/me`, { headers: { Cookie: `${SESSION_COOKIE}=${forged}` } });

      expect(res.status).toBe(401);
    });

    it('returns 401 with an expired JWT', async () => {
      const id = await insertUser(db, 'a@example.com');
      const expired = await new JwtService({ secret: SECRET }).signAsync(
        { sub: id, email: 'a@example.com' },
        { expiresIn: -10 },
      );

      const res = await fetch(`${baseUrl}/me`, { headers: { Cookie: `${SESSION_COOKIE}=${expired}` } });

      expect(res.status).toBe(401);
    });

    it('returns 401 with a tampered JWT', async () => {
      const id = await insertUser(db, 'a@example.com');
      const valid = await new JwtService({ secret: SECRET }).signAsync({ sub: id, email: 'a@example.com' });
      const tampered = `${valid.slice(0, -4)}AAAA`;

      const res = await fetch(`${baseUrl}/me`, { headers: { Cookie: `${SESSION_COOKIE}=${tampered}` } });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /auth/account/export', () => {
    // The logic lives in `account/`, but the route is a public contract (the frontend consumes it).
    it('requires a session', async () => {
      expect((await fetch(`${baseUrl}/account/export`)).status).toBe(401);
    });

    it('downloads the user data as a JSON attachment', async () => {
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
    it('clears the session cookie (expired and empty, with the same attributes)', async () => {
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

  describe('session revocation', () => {
    /** Logs in through the real flow and returns the cookie's JWT. */
    const login = async (email: string): Promise<string> => {
      const token = await requestToken(email);
      const res = await postJson(`${baseUrl}/verify`, { token });
      return cookieValue(sessionSetCookie(res) ?? '');
    };
    const me = (jwt: string): Promise<Response> =>
      fetch(`${baseUrl}/me`, { headers: { Cookie: `${SESSION_COOKIE}=${jwt}` } });
    const postWithSession = (path: string, jwt: string): Promise<Response> =>
      fetch(`${baseUrl}/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: `${SESSION_COOKIE}=${jwt}` },
        body: '{}',
      });

    it('after logout, the previous JWT stops working even though it has not expired', async () => {
      const jwt = await login('a@example.com');
      expect((await me(jwt)).status).toBe(200);

      expect((await postWithSession('logout', jwt)).status).toBe(200);

      expect((await me(jwt)).status).toBe(401);
    });

    it('logout also invalidates the other sessions of the same user, not those of other users', async () => {
      const laptop = await login('a@example.com');
      const phone = await login('a@example.com');
      const other = await login('b@example.com');

      await postWithSession('logout', laptop);

      expect((await me(phone)).status).toBe(401);
      expect((await me(other)).status).toBe(200);
    });

    it('a new login after logout works', async () => {
      await postWithSession('logout', await login('a@example.com'));

      expect((await me(await login('a@example.com'))).status).toBe(200);
    });

    it('POST /auth/sessions/revoke closes every session and clears the cookie', async () => {
      const laptop = await login('a@example.com');
      const phone = await login('a@example.com');

      const res = await postWithSession('sessions/revoke', laptop);

      expect(res.status).toBe(200);
      expect(cookieValue(sessionSetCookie(res) ?? 'x')).toBe('');
      expect((await me(laptop)).status).toBe(401);
      expect((await me(phone)).status).toBe(401);
    });

    it('POST /auth/sessions/revoke requires a session', async () => {
      expect((await postJson(`${baseUrl}/sessions/revoke`, {})).status).toBe(401);
    });

    it('a JWT issued before session versions existed (no `ver`) stays valid until logout', async () => {
      const id = await insertUser(db, 'a@example.com');
      const legacy = await new JwtService({ secret: SECRET }).signAsync({ sub: id, email: 'a@example.com' });

      expect((await me(legacy)).status).toBe(200);
      await postWithSession('logout', legacy);
      expect((await me(legacy)).status).toBe(401);
    });

    it('deleting the account invalidates its sessions', async () => {
      const jwt = await login('a@example.com');

      const res = await fetch(`${baseUrl}/account`, {
        method: 'DELETE',
        headers: { Cookie: `${SESSION_COOKIE}=${jwt}` },
      });

      expect(res.status).toBe(204);
      expect((await me(jwt)).status).toBe(401);
    });
  });

  describe('/auth/request throttling', () => {
    it('allows 5 requests per minute from the same IP and rejects the sixth with 429', async () => {
      const ip = '192.0.2.50';
      for (let i = 0; i < 5; i += 1) {
        expect((await postJson(`${baseUrl}/request`, { email: 'a@example.com' }, ip)).status).toBe(202);
      }

      const sixth = await postJson(`${baseUrl}/request`, { email: 'a@example.com' }, ip);

      expect(sixth.status).toBe(429);
      // Another IP does not share the quota.
      expect((await postJson(`${baseUrl}/request`, { email: 'a@example.com' }, '192.0.2.51')).status).toBe(202);
    });
  });
});
