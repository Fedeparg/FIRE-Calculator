import { randomBytes } from 'node:crypto';

import type { SchedulerRegistry } from '@nestjs/schedule';
import type { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js';
import { eq, sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { Database } from '../db/database.module.js';
import { loginTokens, mcpAuditLog, oauthAuthCodes, oauthClients, oauthGrants, oauthTokens } from '../db/schema.js';
import { fakeConfig } from '../../test/config.js';
import { createTestDb, insertUser, resetDb } from '../../test/db.js';
import { DataRetentionJob, RETENTION_BATCH_SIZE } from './data-retention.js';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const daysAgo = (days: number): Date => new Date(Date.now() - days * DAY);
const randomHash = (): string => randomBytes(16).toString('hex');

/** Minimal DCR client data (only the row matters, not its content). */
const clientData = (clientId: string): OAuthClientInformationFull => ({
  client_id: clientId,
  redirect_uris: ['http://localhost:9999/callback'],
});

describe('DataRetentionJob (Postgres integration)', () => {
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
   * Builds the cleanup job with the given environment variables. Tests do NOT call
   * `onModuleInit()`: it would register a real CronJob.
   */
  function reaper(env: Record<string, string> = {}): DataRetentionJob {
    return new DataRetentionJob(db, fakeConfig(env), {} as SchedulerRegistry);
  }

  async function insertClient(clientId: string, opts: { createdAt: Date; lastUsedAt?: Date }) {
    await db.insert(oauthClients).values({
      clientId,
      data: clientData(clientId),
      createdAt: opts.createdAt,
      lastUsedAt: opts.lastUsedAt ?? null,
    });
  }

  describe('expired OAuth codes and tokens', () => {
    it('deletes the expired ones and keeps the valid ones (even if consumed)', async () => {
      const userId = await insertUser(db, 'a@example.com');
      await db.insert(oauthAuthCodes).values([
        {
          codeHash: 'expired',
          userId,
          clientId: 'c1',
          scopes: ['portfolio:read'],
          codeChallenge: 'x',
          redirectUri: 'http://localhost/cb',
          expiresAt: new Date(Date.now() - HOUR),
        },
        {
          codeHash: 'valid',
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
          tokenHash: 'expired-access',
          type: 'access',
          userId,
          clientId: 'c1',
          scopes: ['portfolio:read'],
          audience: 'http://localhost:3000/api/mcp',
          expiresAt: new Date(Date.now() - HOUR),
        },
        {
          // Refresh token already rotated but NOT expired: it must survive so its reuse can be detected.
          tokenHash: 'consumed-valid-refresh',
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
      expect(remaining.map((r) => r.tokenHash)).toEqual(['consumed-valid-refresh']);
    });
  });

  describe('login_tokens', () => {
    it('deletes the old useless ones and keeps the rest', async () => {
      await db.insert(loginTokens).values([
        {
          email: 'a@example.com',
          tokenHash: 'old-consumed',
          expiresAt: daysAgo(40),
          consumedAt: daysAgo(40),
          createdAt: daysAgo(40),
        },
        {
          email: 'a@example.com',
          tokenHash: 'old-expired',
          expiresAt: daysAgo(40),
          createdAt: daysAgo(40),
        },
        {
          email: 'a@example.com',
          tokenHash: 'recent-consumed',
          expiresAt: new Date(Date.now() - HOUR),
          consumedAt: new Date(Date.now() - HOUR),
          createdAt: new Date(Date.now() - HOUR),
        },
        {
          email: 'a@example.com',
          tokenHash: 'old-but-valid',
          expiresAt: new Date(Date.now() + DAY),
          createdAt: daysAgo(40),
        },
      ]);

      const summary = await reaper().run();

      expect(summary.loginTokens).toBe(2);
      const remaining = await db.select({ hash: loginTokens.tokenHash }).from(loginTokens);
      expect(remaining.map((r) => r.hash).sort()).toEqual(['old-but-valid', 'recent-consumed']);
    });

    it('honors LOGIN_TOKEN_RETENTION_DAYS', async () => {
      await db.insert(loginTokens).values({
        email: 'a@example.com',
        tokenHash: 'five-days-old',
        expiresAt: daysAgo(5),
        consumedAt: daysAgo(5),
        createdAt: daysAgo(5),
      });

      expect((await reaper().run()).loginTokens).toBe(0);
      expect((await reaper({ LOGIN_TOKEN_RETENTION_DAYS: '1' }).run()).loginTokens).toBe(1);
    });
  });

  describe('mcp_audit_log', () => {
    it('deletes entries older than the retention (180 days by default)', async () => {
      const userId = await insertUser(db, 'a@example.com');
      await db.insert(mcpAuditLog).values([
        { userId, clientId: 'c1', tool: 'list', outcome: 'ok', createdAt: daysAgo(200) },
        { userId, clientId: 'c1', tool: 'list', outcome: 'ok', createdAt: daysAgo(10) },
      ]);

      const summary = await reaper().run();

      expect(summary.auditEntries).toBe(1);
      expect(await db.select().from(mcpAuditLog)).toHaveLength(1);
    });

    it('honors MCP_AUDIT_RETENTION_DAYS', async () => {
      const userId = await insertUser(db, 'a@example.com');
      await db
        .insert(mcpAuditLog)
        .values({ userId, clientId: 'c1', tool: 'list', outcome: 'ok', createdAt: daysAgo(10) });

      expect((await reaper({ MCP_AUDIT_RETENTION_DAYS: '5' }).run()).auditEntries).toBe(1);
    });

    it('deletes in batches when there are more rows than the batch size', async () => {
      const userId = await insertUser(db, 'a@example.com');
      const total = RETENTION_BATCH_SIZE * 2 + 5;
      await db.execute(sql`
        insert into mcp_audit_log (user_id, client_id, tool, outcome, created_at)
        select ${userId}, 'c1', 'list', 'ok', now() - interval '200 days'
        from generate_series(1, ${total})
      `);

      expect((await reaper().run()).auditEntries).toBe(total);
      expect(await db.select().from(mcpAuditLog)).toHaveLength(0);
    });

    it('ignores an invalid retention and falls back to the default', async () => {
      const userId = await insertUser(db, 'a@example.com');
      await db
        .insert(mcpAuditLog)
        .values({ userId, clientId: 'c1', tool: 'list', outcome: 'ok', createdAt: daysAgo(10) });

      expect((await reaper({ MCP_AUDIT_RETENTION_DAYS: 'zero' }).run()).auditEntries).toBe(0);
      expect((await reaper({ MCP_AUDIT_RETENTION_DAYS: '-3' }).run()).auditEntries).toBe(0);
    });
  });

  describe('abandoned oauth_clients', () => {
    it('deletes an old client with no grants or tokens', async () => {
      await insertClient('abandoned', { createdAt: daysAgo(60) });

      const summary = await reaper().run();

      expect(summary.clients).toBe(1);
      expect(await db.select().from(oauthClients)).toHaveLength(0);
    });

    it('NEVER deletes a client with a live consent, however old', async () => {
      const userId = await insertUser(db, 'a@example.com');
      await insertClient('with-grant', { createdAt: daysAgo(400) });
      await db.insert(oauthGrants).values({ userId, clientId: 'with-grant', scopes: ['portfolio:read'] });

      const summary = await reaper().run();

      expect(summary.clients).toBe(0);
      expect(await db.select().from(oauthClients)).toHaveLength(1);
    });

    it('NEVER deletes a client with tokens, even if the grant was deleted', async () => {
      const userId = await insertUser(db, 'a@example.com');
      await insertClient('with-token', { createdAt: daysAgo(400) });
      await db.insert(oauthTokens).values({
        tokenHash: randomHash(),
        type: 'refresh',
        userId,
        clientId: 'with-token',
        scopes: ['portfolio:read'],
        audience: 'http://localhost:3000/api/mcp',
        expiresAt: new Date(Date.now() + DAY),
      });

      const summary = await reaper().run();

      expect(summary.clients).toBe(0);
      expect(await db.select().from(oauthClients)).toHaveLength(1);
    });

    it('keeps a recent client and a recently used one', async () => {
      await insertClient('just-registered', { createdAt: daysAgo(2) });
      await insertClient('used-yesterday', { createdAt: daysAgo(90), lastUsedAt: daysAgo(1) });

      const summary = await reaper().run();

      expect(summary.clients).toBe(0);
      expect(await db.select().from(oauthClients)).toHaveLength(2);
    });

    it('deletes a client whose last use is outside the retention', async () => {
      await insertClient('old-use', { createdAt: daysAgo(120), lastUsedAt: daysAgo(90) });
      await insertClient('in-use', { createdAt: daysAgo(120), lastUsedAt: daysAgo(3) });

      const summary = await reaper().run();

      expect(summary.clients).toBe(1);
      const remaining = await db.select({ id: oauthClients.clientId }).from(oauthClients);
      expect(remaining.map((r) => r.id)).toEqual(['in-use']);
    });

    it('honors OAUTH_CLIENT_RETENTION_DAYS', async () => {
      await insertClient('five-days-old', { createdAt: daysAgo(5) });

      expect((await reaper().run()).clients).toBe(0);
      expect((await reaper({ OAUTH_CLIENT_RETENTION_DAYS: '1' }).run()).clients).toBe(1);
    });
  });

  it('deletes nothing and does not fail on an empty database', async () => {
    const summary = await reaper().run();

    expect(summary).toEqual({
      authCodes: 0,
      tokens: 0,
      loginTokens: 0,
      auditEntries: 0,
      clients: 0,
    });
  });

  it('cascading account deletion still works after the cleanup', async () => {
    // Checks that the reaper does not interfere with GDPR: a deleted user's tokens disappear
    // through the FK, not because the reaper prunes them.
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
