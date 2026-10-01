import { randomBytes } from 'node:crypto';

import type { ConfigService } from '@nestjs/config';
import type { SchedulerRegistry } from '@nestjs/schedule';
import type { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { Database } from '../db/database.module.js';
import { loginTokens, mcpAuditLog, oauthAuthCodes, oauthClients, oauthGrants, oauthTokens } from '../db/schema.js';
import { createTestDb, insertUser, resetDb } from '../../test/db.js';
import { OAuthReaper } from './oauth-reaper.js';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const daysAgo = (days: number): Date => new Date(Date.now() - days * DAY);
const randomHash = (): string => randomBytes(16).toString('hex');

/** Datos mínimos de un cliente DCR (solo nos importa la fila, no su contenido). */
const clientData = (clientId: string): OAuthClientInformationFull => ({
  client_id: clientId,
  redirect_uris: ['http://localhost:9999/callback'],
});

describe('OAuthReaper (integración con Postgres)', () => {
  let db: Database;
  let close: () => Promise<void>;

  beforeAll(() => {
    ({ db, close } = createTestDb());
  });

  afterEach(async () => {
    await resetDb(db);
  });

  afterAll(async () => {
    await close();
  });

  /**
   * Construye el reaper con las variables de entorno indicadas. NO se llama a
   * `onModuleInit()` en los tests: registraría un CronJob real.
   */
  function reaper(env: Record<string, string> = {}): OAuthReaper {
    const config = { get: (key: string) => env[key] } as unknown as ConfigService;
    return new OAuthReaper(db, config, {} as SchedulerRegistry);
  }

  async function insertClient(clientId: string, opts: { createdAt: Date; lastUsedAt?: Date }) {
    await db.insert(oauthClients).values({
      clientId,
      data: clientData(clientId),
      createdAt: opts.createdAt,
      lastUsedAt: opts.lastUsedAt ?? null,
    });
  }

  describe('códigos y tokens OAuth caducados', () => {
    it('borra los caducados y conserva los vigentes (aunque estén consumidos)', async () => {
      const userId = await insertUser(db, 'a@example.com');
      await db.insert(oauthAuthCodes).values([
        {
          codeHash: 'expirado',
          userId,
          clientId: 'c1',
          scopes: ['portfolio:read'],
          codeChallenge: 'x',
          redirectUri: 'http://localhost/cb',
          expiresAt: new Date(Date.now() - HOUR),
        },
        {
          codeHash: 'vigente',
          userId,
          clientId: 'c1',
          scopes: ['portfolio:read'],
          codeChallenge: 'x',
          redirectUri: 'http://localhost/cb',
          expiresAt: new Date(Date.now() + HOUR),
        },
      ]);
      await db.insert(oauthTokens).values([
        {
          tokenHash: 'access-caducado',
          type: 'access',
          userId,
          clientId: 'c1',
          scopes: ['portfolio:read'],
          audience: 'http://localhost:3000/api/mcp',
          expiresAt: new Date(Date.now() - HOUR),
        },
        {
          // Refresh ya rotado pero NO caducado: debe sobrevivir para detectar su reuso.
          tokenHash: 'refresh-consumido-vigente',
          type: 'refresh',
          userId,
          clientId: 'c1',
          scopes: ['portfolio:read'],
          audience: 'http://localhost:3000/api/mcp',
          expiresAt: new Date(Date.now() + DAY),
          consumedAt: new Date(),
        },
      ]);

      const summary = await reaper().run();

      expect(summary.authCodes).toBe(1);
      expect(summary.tokens).toBe(1);
      expect(await db.select().from(oauthAuthCodes)).toHaveLength(1);
      const remaining = await db.select().from(oauthTokens);
      expect(remaining.map((r) => r.tokenHash)).toEqual(['refresh-consumido-vigente']);
    });
  });

  describe('login_tokens', () => {
    it('borra los antiguos ya inservibles y conserva el resto', async () => {
      await db.insert(loginTokens).values([
        {
          email: 'a@example.com',
          tokenHash: 'antiguo-consumido',
          expiresAt: daysAgo(40),
          consumedAt: daysAgo(40),
          createdAt: daysAgo(40),
        },
        {
          email: 'a@example.com',
          tokenHash: 'antiguo-caducado',
          expiresAt: daysAgo(40),
          createdAt: daysAgo(40),
        },
        {
          email: 'a@example.com',
          tokenHash: 'reciente-consumido',
          expiresAt: new Date(Date.now() - HOUR),
          consumedAt: new Date(Date.now() - HOUR),
          createdAt: new Date(Date.now() - HOUR),
        },
        {
          email: 'a@example.com',
          tokenHash: 'antiguo-pero-vigente',
          expiresAt: new Date(Date.now() + DAY),
          createdAt: daysAgo(40),
        },
      ]);

      const summary = await reaper().run();

      expect(summary.loginTokens).toBe(2);
      const remaining = await db.select({ hash: loginTokens.tokenHash }).from(loginTokens);
      expect(remaining.map((r) => r.hash).sort()).toEqual(['antiguo-pero-vigente', 'reciente-consumido']);
    });

    it('respeta LOGIN_TOKEN_RETENTION_DAYS', async () => {
      await db.insert(loginTokens).values({
        email: 'a@example.com',
        tokenHash: 'de-hace-cinco-dias',
        expiresAt: daysAgo(5),
        consumedAt: daysAgo(5),
        createdAt: daysAgo(5),
      });

      expect((await reaper().run()).loginTokens).toBe(0);
      expect((await reaper({ LOGIN_TOKEN_RETENTION_DAYS: '1' }).run()).loginTokens).toBe(1);
    });
  });

  describe('mcp_audit_log', () => {
    it('borra las entradas más antiguas que la retención (180 días por defecto)', async () => {
      const userId = await insertUser(db, 'a@example.com');
      await db.insert(mcpAuditLog).values([
        { userId, clientId: 'c1', tool: 'list', outcome: 'ok', createdAt: daysAgo(200) },
        { userId, clientId: 'c1', tool: 'list', outcome: 'ok', createdAt: daysAgo(10) },
      ]);

      const summary = await reaper().run();

      expect(summary.auditEntries).toBe(1);
      expect(await db.select().from(mcpAuditLog)).toHaveLength(1);
    });

    it('respeta MCP_AUDIT_RETENTION_DAYS', async () => {
      const userId = await insertUser(db, 'a@example.com');
      await db
        .insert(mcpAuditLog)
        .values({ userId, clientId: 'c1', tool: 'list', outcome: 'ok', createdAt: daysAgo(10) });

      expect((await reaper({ MCP_AUDIT_RETENTION_DAYS: '5' }).run()).auditEntries).toBe(1);
    });

    it('ignora una retención inválida y cae al valor por defecto', async () => {
      const userId = await insertUser(db, 'a@example.com');
      await db
        .insert(mcpAuditLog)
        .values({ userId, clientId: 'c1', tool: 'list', outcome: 'ok', createdAt: daysAgo(10) });

      expect((await reaper({ MCP_AUDIT_RETENTION_DAYS: 'cero' }).run()).auditEntries).toBe(0);
      expect((await reaper({ MCP_AUDIT_RETENTION_DAYS: '-3' }).run()).auditEntries).toBe(0);
    });
  });

  describe('oauth_clients abandonados', () => {
    it('borra el cliente antiguo sin grants ni tokens', async () => {
      await insertClient('abandonado', { createdAt: daysAgo(60) });

      const summary = await reaper().run();

      expect(summary.clients).toBe(1);
      expect(await db.select().from(oauthClients)).toHaveLength(0);
    });

    it('NUNCA borra un cliente con un consentimiento vivo, por antiguo que sea', async () => {
      const userId = await insertUser(db, 'a@example.com');
      await insertClient('con-grant', { createdAt: daysAgo(400) });
      await db.insert(oauthGrants).values({ userId, clientId: 'con-grant', scopes: ['portfolio:read'] });

      const summary = await reaper().run();

      expect(summary.clients).toBe(0);
      expect(await db.select().from(oauthClients)).toHaveLength(1);
    });

    it('NUNCA borra un cliente con tokens, aunque el grant se haya borrado', async () => {
      const userId = await insertUser(db, 'a@example.com');
      await insertClient('con-token', { createdAt: daysAgo(400) });
      await db.insert(oauthTokens).values({
        tokenHash: randomHash(),
        type: 'refresh',
        userId,
        clientId: 'con-token',
        scopes: ['portfolio:read'],
        audience: 'http://localhost:3000/api/mcp',
        expiresAt: new Date(Date.now() + DAY),
      });

      const summary = await reaper().run();

      expect(summary.clients).toBe(0);
      expect(await db.select().from(oauthClients)).toHaveLength(1);
    });

    it('conserva un cliente reciente y uno usado hace poco', async () => {
      await insertClient('recien-registrado', { createdAt: daysAgo(2) });
      await insertClient('usado-ayer', { createdAt: daysAgo(90), lastUsedAt: daysAgo(1) });

      const summary = await reaper().run();

      expect(summary.clients).toBe(0);
      expect(await db.select().from(oauthClients)).toHaveLength(2);
    });

    it('borra un cliente cuyo último uso quedó fuera de la retención', async () => {
      await insertClient('viejo-uso', { createdAt: daysAgo(120), lastUsedAt: daysAgo(90) });
      await insertClient('en-uso', { createdAt: daysAgo(120), lastUsedAt: daysAgo(3) });

      const summary = await reaper().run();

      expect(summary.clients).toBe(1);
      const remaining = await db.select({ id: oauthClients.clientId }).from(oauthClients);
      expect(remaining.map((r) => r.id)).toEqual(['en-uso']);
    });

    it('respeta OAUTH_CLIENT_RETENTION_DAYS', async () => {
      await insertClient('de-hace-cinco-dias', { createdAt: daysAgo(5) });

      expect((await reaper().run()).clients).toBe(0);
      expect((await reaper({ OAUTH_CLIENT_RETENTION_DAYS: '1' }).run()).clients).toBe(1);
    });
  });

  it('no borra nada ni falla con la base de datos vacía', async () => {
    const summary = await reaper().run();

    expect(summary).toEqual({
      authCodes: 0,
      tokens: 0,
      loginTokens: 0,
      auditEntries: 0,
      clients: 0,
    });
  });

  it('el borrado en cascada de la cuenta sigue funcionando tras la limpieza', async () => {
    // Comprobación de que el reaper no interfiere con el RGPD: los tokens de un usuario
    // borrado desaparecen por FK, no porque los pode el reaper.
    const userId = await insertUser(db, 'a@example.com');
    await db.insert(oauthTokens).values({
      tokenHash: randomHash(),
      type: 'access',
      userId,
      clientId: 'c1',
      scopes: ['portfolio:read'],
      audience: 'http://localhost:3000/api/mcp',
      expiresAt: new Date(Date.now() + DAY),
    });

    await reaper().run();

    const rows = await db.select().from(oauthTokens).where(eq(oauthTokens.userId, userId));
    expect(rows).toHaveLength(1);
  });
});
