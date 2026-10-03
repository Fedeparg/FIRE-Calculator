import { createHash, randomBytes } from 'node:crypto';

import { JwtService } from '@nestjs/jwt';
import type { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js';
import { SESSION_COOKIE } from '@sextante/core/contracts';
import { and, eq } from 'drizzle-orm';
import type { Request, Response } from 'express';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { Database } from '../db/database.module.js';
import { oauthTokens } from '../db/schema.js';
import { fakeConfig } from '../../test/config.js';
import { createTestDb, insertUser, resetDb } from '../../test/db.js';
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

describe('SextanteOAuthProvider (integración con Postgres)', () => {
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
    provider = new SextanteOAuthProvider(db, jwt, urls, new OAuthClientsStore(db), grants);
  });

  afterEach(async () => {
    await resetDb(db);
  });

  afterAll(async () => {
    await close();
  });

  /** Inserta un token (access/refresh) ya hasheado y devuelve su valor en claro. */
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

  describe('authorize — scopes', () => {
    it('un cliente que pide solo portfolio:write ve también portfolio:read en el consentimiento', async () => {
      const userId = await insertUser(db, 'a@example.com');
      const session = await jwt.signAsync({ sub: userId, email: 'a@example.com' });
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
        {
          scopes: [SCOPE_PORTFOLIO_WRITE],
          redirectUri: CLIENT.redirect_uris[0],
          codeChallenge: 'challenge',
        },
        res,
      );

      const consent = new URL(redirectedTo);
      expect(consent.pathname).toBe('/oauth/consent');
      expect(consent.searchParams.get('scope')).toBe(`${SCOPE_PORTFOLIO_READ} ${SCOPE_PORTFOLIO_WRITE}`);
    });
  });

  describe('verifyAccessToken — audience binding (RFC 8707)', () => {
    it('acepta un access token con la audiencia canónica y expone el userId', async () => {
      const userId = await insertUser(db, 'a@example.com');
      const token = await seedToken({ type: 'access', userId });

      const info = await provider.verifyAccessToken(token);
      expect(info.clientId).toBe(CLIENT.client_id);
      expect(info.extra?.userId).toBe(userId);
      expect(info.resource?.href).toBe(urls.audience);
    });

    it('rechaza un token emitido para OTRA audiencia', async () => {
      const userId = await insertUser(db, 'a@example.com');
      const token = await seedToken({
        type: 'access',
        userId,
        audience: 'http://localhost:3000/api/otro-recurso',
      });

      await expect(provider.verifyAccessToken(token)).rejects.toThrow(/audience/i);
    });

    it('rechaza un token expirado', async () => {
      const userId = await insertUser(db, 'a@example.com');
      const token = await seedToken({
        type: 'access',
        userId,
        expiresAt: new Date(Date.now() - 1_000),
      });

      await expect(provider.verifyAccessToken(token)).rejects.toThrow(/expired/i);
    });

    it('rechaza un token inexistente', async () => {
      await expect(provider.verifyAccessToken(randomToken())).rejects.toThrow(/not found/i);
    });
  });

  describe('exchangeRefreshToken — rotación y detección de reuso', () => {
    it('rota el refresh token y consume el anterior', async () => {
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

      // El refresh original queda consumido.
      const [old] = await db
        .select({ consumedAt: oauthTokens.consumedAt })
        .from(oauthTokens)
        .where(eq(oauthTokens.tokenHash, hash(refresh)));
      expect(old.consumedAt).not.toBeNull();
    });

    it('detecta el reuso de un refresh ya rotado y revoca toda la cadena', async () => {
      const userId = await insertUser(db, 'a@example.com');
      const refresh = await seedToken({
        type: 'refresh',
        userId,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
      });

      // Primer canje: válido.
      await provider.exchangeRefreshToken(CLIENT, refresh);

      // Reuso del mismo refresh: robo potencial → error + revocación de la cadena.
      await expect(provider.exchangeRefreshToken(CLIENT, refresh)).rejects.toThrow(/reuse/i);

      // Tras la revocación no queda NINGÚN token del cliente para ese usuario.
      const remaining = await db
        .select({ tokenHash: oauthTokens.tokenHash })
        .from(oauthTokens)
        .where(and(eq(oauthTokens.userId, userId), eq(oauthTokens.clientId, CLIENT.client_id)));
      expect(remaining).toHaveLength(0);
    });

    it('si la emisión falla, el refresh NO queda consumido (el cliente puede reintentar)', async () => {
      const userId = await insertUser(db, 'a@example.com');
      const refresh = await seedToken({
        type: 'refresh',
        userId,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
      });
      // Access y refresh con el mismo valor: el segundo INSERT viola el único de `token_hash`.
      const spy = vi
        .spyOn(provider as unknown as { randomToken: () => string }, 'randomToken')
        .mockReturnValue('mismo-valor');

      await expect(provider.exchangeRefreshToken(CLIENT, refresh)).rejects.toThrow();
      spy.mockRestore();

      const [row] = await db
        .select({ consumedAt: oauthTokens.consumedAt })
        .from(oauthTokens)
        .where(eq(oauthTokens.tokenHash, hash(refresh)));
      expect(row.consumedAt).toBeNull();
      // Y el reintento funciona, sin tomarse por reuso.
      await expect(provider.exchangeRefreshToken(CLIENT, refresh)).resolves.toHaveProperty('access_token');
    });

    it('pedir más scopes de los concedidos no gasta el refresh', async () => {
      const userId = await insertUser(db, 'a@example.com');
      const refresh = await seedToken({ type: 'refresh', userId });

      await expect(provider.exchangeRefreshToken(CLIENT, refresh, ['portfolio:write'])).rejects.toThrow(/exceed/i);
      await expect(provider.exchangeRefreshToken(CLIENT, refresh)).resolves.toHaveProperty('access_token');
    });

    it('rechaza un refresh token de otro cliente', async () => {
      const userId = await insertUser(db, 'a@example.com');
      const refresh = await seedToken({ type: 'refresh', userId });

      const otherClient = { ...CLIENT, client_id: 'client-2' };
      await expect(provider.exchangeRefreshToken(otherClient, refresh)).rejects.toThrow(/not issued to this client/i);
    });
  });
});
