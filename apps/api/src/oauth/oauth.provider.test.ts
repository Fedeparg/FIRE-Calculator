import { createHash, randomBytes } from 'node:crypto';

import { JwtService } from '@nestjs/jwt';
import type { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js';
import { firstItem } from '@sextante/core/arrays';
import { SESSION_COOKIE } from '@sextante/core/contracts';
import { and, eq } from 'drizzle-orm';
import type { Request, Response } from 'express';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { Database } from '../db/database.module.js';
import { oauthTokens, users } from '../db/schema.js';
import { fakeConfig } from '../../test/config.js';
import { createTestDb, insertUser, resetDb } from '../../test/db.js';
import { SessionService } from '../auth/session.service.js';
import { OAuthClientsStore } from './oauth-clients.store.js';
import { OAuthGrantsService } from './oauth-grants.service.js';
import { OAuthUrls } from './oauth-urls.js';
import { SextanteOAuthProvider } from './oauth.provider.js';
import { REFRESH_TOKEN_TTL_SECONDS, SCOPE_PORTFOLIO_READ, SCOPE_PORTFOLIO_WRITE } from './oauth.constants.js';

const APP_URL = 'http://localhost:3000';
const CLIENT: OAuthClientInformationFull = {
  client_id: 'client-1',
  redirect_uris: ['http://localhost:9999/callback'],
};

const hash = (value: string): string => createHash('sha256').update(value).digest('hex');
const randomToken = (): string => randomBytes(32).toString('base64url');

describe('SextanteOAuthProvider (Postgres integration)', () => {
  let db: Database;
  let close: () => Promise<void>;
  let urls: OAuthUrls;
  let grants: OAuthGrantsService;
  let provider: SextanteOAuthProvider;
  const jwt = new JwtService({ secret: 'test-secret' });

  beforeAll(() => {
    ({ db, close } = createTestDb());
    urls = new OAuthUrls(fakeConfig({ APP_URL }));
    grants = new OAuthGrantsService(db);
    provider = new SextanteOAuthProvider(db, new SessionService(jwt, db), urls, new OAuthClientsStore(db), grants);
  });

  afterEach(async () => {
    await resetDb(db);
  });

  afterAll(async () => {
    await close();
  });

  /** Inserts an already hashed token (access/refresh) and returns its plain value. */
  async function seedToken(opts: {
    type: 'access' | 'refresh';
    userId: string;
    audience?: string;
    expiresAt?: Date;
    consumedAt?: Date | null;
  }): Promise<string> {
    const plain = randomToken();
    await db.insert(oauthTokens).values({
      tokenHash: hash(plain),
      type: opts.type,
      userId: opts.userId,
      clientId: CLIENT.client_id,
      scopes: ['portfolio:read'],
      audience: opts.audience ?? urls.audience,
      expiresAt: opts.expiresAt ?? new Date(Date.now() + 3_600_000),
      consumedAt: opts.consumedAt ?? null,
    });
    return plain;
  }

  describe('authorize', () => {
    /** Calls `authorize` with the given session cookie and returns where it redirects to. */
    async function authorizeWith(session: string, scopes: string[]): Promise<URL> {
      let redirectedTo = '';
      const res = {
        req: { cookies: { [SESSION_COOKIE]: session }, originalUrl: '/authorize?client_id=client-1' },
        redirect: (url: string) => {
          redirectedTo = url;
        },
      } as Partial<Response> as Response;
      res.req = res.req as Request;

      await provider.authorize(
        CLIENT,
        { scopes, redirectUri: firstItem(CLIENT.redirect_uris), codeChallenge: 'challenge' },
        res,
      );
      return new URL(redirectedTo);
    }

    it('a client requesting only portfolio:write also sees portfolio:read on the consent screen', async () => {
      const userId = await insertUser(db, 'a@example.com');
      const session = await jwt.signAsync({ sub: userId, email: 'a@example.com' });

      const consent = await authorizeWith(session, [SCOPE_PORTFOLIO_WRITE]);

      expect(consent.pathname).toBe('/oauth/consent');
      expect(consent.searchParams.get('scope')).toBe(`${SCOPE_PORTFOLIO_READ} ${SCOPE_PORTFOLIO_WRITE}`);
    });

    it('a session of a deleted account does not authorize: it sends to the login', async () => {
      const userId = await insertUser(db, 'a@example.com');
      const session = await jwt.signAsync({ sub: userId, email: 'a@example.com' });
      await db.delete(users).where(eq(users.id, userId));

      const target = await authorizeWith(session, [SCOPE_PORTFOLIO_READ]);

      expect(target.pathname).toBe('/entrar');
    });
  });

  describe('verifyAccessToken — audience binding (RFC 8707)', () => {
    it('accepts an access token with the canonical audience and exposes the userId', async () => {
      const userId = await insertUser(db, 'a@example.com');
      const token = await seedToken({ type: 'access', userId });

      const info = await provider.verifyAccessToken(token);
      expect(info.clientId).toBe(CLIENT.client_id);
      expect(info.extra?.userId).toBe(userId);
      expect(info.resource?.href).toBe(urls.audience);
    });

    it('rejects a token issued for ANOTHER audience', async () => {
      const userId = await insertUser(db, 'a@example.com');
      const token = await seedToken({
        type: 'access',
        userId,
        audience: 'http://localhost:3000/api/other-resource',
      });

      await expect(provider.verifyAccessToken(token)).rejects.toThrow(/audience/i);
    });

    it('rejects an expired token', async () => {
      const userId = await insertUser(db, 'a@example.com');
      const token = await seedToken({
        type: 'access',
        userId,
        expiresAt: new Date(Date.now() - 1_000),
      });

      await expect(provider.verifyAccessToken(token)).rejects.toThrow(/expired/i);
    });

    it('rejects a non-existent token', async () => {
      await expect(provider.verifyAccessToken(randomToken())).rejects.toThrow(/not found/i);
    });
  });

  describe('exchangeRefreshToken — rotation and reuse detection', () => {
    it('rotates the refresh token and consumes the previous one', async () => {
      const userId = await insertUser(db, 'a@example.com');
      const refresh = await seedToken({
        type: 'refresh',
        userId,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
      });

      const tokens = await provider.exchangeRefreshToken(CLIENT, refresh);
      expect(typeof tokens.access_token).toBe('string');
      expect(typeof tokens.refresh_token).toBe('string');
      expect(tokens.refresh_token).not.toBe(refresh);

      // The original refresh token is consumed.
      const old = firstItem(
        await db
          .select({ consumedAt: oauthTokens.consumedAt })
          .from(oauthTokens)
          .where(eq(oauthTokens.tokenHash, hash(refresh))),
      );
      expect(old.consumedAt).not.toBeNull();
    });

    it('detects reuse of an already rotated refresh token and revokes the whole chain', async () => {
      const userId = await insertUser(db, 'a@example.com');
      const refresh = await seedToken({
        type: 'refresh',
        userId,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
      });

      // First exchange: valid.
      await provider.exchangeRefreshToken(CLIENT, refresh);

      // Reuse of the same refresh token: potential theft → error + chain revocation.
      await expect(provider.exchangeRefreshToken(CLIENT, refresh)).rejects.toThrow(/reuse/i);

      // After revocation, NO token of the client remains for that user.
      const remaining = await db
        .select({ tokenHash: oauthTokens.tokenHash })
        .from(oauthTokens)
        .where(and(eq(oauthTokens.userId, userId), eq(oauthTokens.clientId, CLIENT.client_id)));
      expect(remaining).toHaveLength(0);
    });

    it('if issuance fails, the refresh token is NOT consumed (the client can retry)', async () => {
      const userId = await insertUser(db, 'a@example.com');
      const refresh = await seedToken({
        type: 'refresh',
        userId,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
      });
      // Access and refresh with the same value: the second INSERT violates the `token_hash` unique index.
      const spy = vi
        .spyOn(provider as unknown as { newToken: () => string }, 'newToken')
        .mockReturnValue('mismo-valor');

      await expect(provider.exchangeRefreshToken(CLIENT, refresh)).rejects.toThrow();
      spy.mockRestore();

      const row = firstItem(
        await db
          .select({ consumedAt: oauthTokens.consumedAt })
          .from(oauthTokens)
          .where(eq(oauthTokens.tokenHash, hash(refresh))),
      );
      expect(row.consumedAt).toBeNull();
      // And the retry works, without being taken for reuse.
      await expect(provider.exchangeRefreshToken(CLIENT, refresh)).resolves.toHaveProperty('access_token');
    });

    it('requesting more scopes than granted does not spend the refresh token', async () => {
      const userId = await insertUser(db, 'a@example.com');
      const refresh = await seedToken({ type: 'refresh', userId });

      await expect(provider.exchangeRefreshToken(CLIENT, refresh, ['portfolio:write'])).rejects.toThrow(/exceed/i);
      await expect(provider.exchangeRefreshToken(CLIENT, refresh)).resolves.toHaveProperty('access_token');
    });

    it('rejects a refresh token from another client', async () => {
      const userId = await insertUser(db, 'a@example.com');
      const refresh = await seedToken({ type: 'refresh', userId });

      const otherClient = { ...CLIENT, client_id: 'client-2' };
      await expect(provider.exchangeRefreshToken(otherClient, refresh)).rejects.toThrow(/not issued to this client/i);
    });
  });
});
