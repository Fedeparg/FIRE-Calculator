import { randomBytes } from 'node:crypto';

import { and, eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { firstItem, itemAt } from '@sextante/core/arrays';

import type { Database } from '../db/database.module.js';
import { oauthClients, oauthGrants, oauthTokens } from '../db/schema.js';
import { createTestDb, insertUser, resetDb } from '../../test/db.js';
import { OAuthGrantsService } from './oauth-grants.service.js';

const randomHash = (): string => randomBytes(16).toString('hex');

describe('OAuthGrantsService (Postgres integration)', () => {
  let db: Database;
  let close: () => Promise<void>;
  let service: OAuthGrantsService;

  beforeAll(() => {
    ({ db, close } = createTestDb());
    service = new OAuthGrantsService(db);
  });

  afterEach(async () => {
    await resetDb(db);
  });

  afterAll(async () => {
    await close();
  });

  const insertClient = async (clientId: string): Promise<void> => {
    await db.insert(oauthClients).values({ clientId, data: { client_id: clientId, redirect_uris: [] } });
  };

  const insertToken = async (userId: string, clientId: string, kind: 'access' | 'refresh'): Promise<void> => {
    await db.insert(oauthTokens).values({
      tokenHash: randomHash(),
      type: kind,
      clientId,
      userId,
      scopes: ['portfolio:read'],
      audience: 'https://sextante.test/api/mcp',
      expiresAt: new Date(Date.now() + 3_600_000),
    });
  };

  describe('hasConsent / recordConsent', () => {
    it('without prior consent, hasConsent is false', async () => {
      const userId = await insertUser(db, 'a@example.com');
      await insertClient('c1');

      expect(await service.hasConsent(userId, 'c1', ['portfolio:read'])).toBe(false);
    });

    it('only covers the granted scopes: requesting one more requires consenting again', async () => {
      const userId = await insertUser(db, 'a@example.com');
      await insertClient('c1');
      await service.recordConsent(userId, 'c1', ['portfolio:read']);

      expect(await service.hasConsent(userId, 'c1', ['portfolio:read'])).toBe(true);
      expect(await service.hasConsent(userId, 'c1', ['portfolio:read', 'portfolio:write'])).toBe(false);
    });

    it('consent is per user and per client', async () => {
      const userA = await insertUser(db, 'a@example.com');
      const userB = await insertUser(db, 'b@example.com');
      await insertClient('c1');
      await insertClient('c2');
      await service.recordConsent(userA, 'c1', ['portfolio:read']);

      expect(await service.hasConsent(userB, 'c1', ['portfolio:read'])).toBe(false);
      expect(await service.hasConsent(userA, 'c2', ['portfolio:read'])).toBe(false);
    });

    it('a new consent is MERGED into the previous one (step-up) without duplicating the row', async () => {
      const userId = await insertUser(db, 'a@example.com');
      await insertClient('c1');
      await service.recordConsent(userId, 'c1', ['portfolio:read']);
      await service.recordConsent(userId, 'c1', ['portfolio:write', 'portfolio:read']);

      const rows = await db.select().from(oauthGrants).where(eq(oauthGrants.userId, userId));
      expect(rows).toHaveLength(1);
      // Grant order, no duplicates.
      expect(itemAt(rows, 0).scopes).toEqual(['portfolio:read', 'portfolio:write']);
      expect(itemAt(rows, 0).lastUsedAt).not.toBeNull();
    });

    it('two concurrent approvals leave ONE row with the union of both, without error', async () => {
      const concurrent = createTestDb({ max: 4 });
      try {
        const parallel = new OAuthGrantsService(concurrent.db);
        const userId = await insertUser(db, 'a@example.com');
        await insertClient('c1');

        await Promise.all([
          parallel.recordConsent(userId, 'c1', ['portfolio:read']),
          parallel.recordConsent(userId, 'c1', ['portfolio:write']),
        ]);

        const rows = await db.select().from(oauthGrants).where(eq(oauthGrants.userId, userId));
        expect(rows).toHaveLength(1);
        expect([...itemAt(rows, 0).scopes].sort()).toEqual(['portfolio:read', 'portfolio:write']);
      } finally {
        await concurrent.close();
      }
    });
  });

  describe('touch', () => {
    it('updates lastUsedAt only for the given consent', async () => {
      const userA = await insertUser(db, 'a@example.com');
      const userB = await insertUser(db, 'b@example.com');
      await insertClient('c1');
      await service.recordConsent(userA, 'c1', ['portfolio:read']);
      await service.recordConsent(userB, 'c1', ['portfolio:read']);
      const longAgo = new Date('2020-01-01T00:00:00Z');
      await db.update(oauthGrants).set({ lastUsedAt: longAgo });

      await service.touch(userA, 'c1');

      const a = firstItem(await db.select().from(oauthGrants).where(eq(oauthGrants.userId, userA)));
      const b = firstItem(await db.select().from(oauthGrants).where(eq(oauthGrants.userId, userB)));
      expect(a.lastUsedAt?.getTime()).toBeGreaterThan(longAgo.getTime());
      expect(b.lastUsedAt?.getTime()).toBe(longAgo.getTime());
    });
  });

  describe('revoke', () => {
    it('deletes the consent and all tokens (access and refresh) of that client', async () => {
      const userId = await insertUser(db, 'a@example.com');
      await insertClient('c1');
      await service.recordConsent(userId, 'c1', ['portfolio:read']);
      await insertToken(userId, 'c1', 'access');
      await insertToken(userId, 'c1', 'refresh');

      await service.revoke(userId, 'c1');

      expect(await service.hasConsent(userId, 'c1', ['portfolio:read'])).toBe(false);
      expect(await db.select().from(oauthTokens).where(eq(oauthTokens.userId, userId))).toEqual([]);
    });

    it('does not touch the consents or tokens of another client of the same user', async () => {
      const userId = await insertUser(db, 'a@example.com');
      await insertClient('c1');
      await insertClient('c2');
      await service.recordConsent(userId, 'c1', ['portfolio:read']);
      await service.recordConsent(userId, 'c2', ['portfolio:read']);
      await insertToken(userId, 'c2', 'access');

      await service.revoke(userId, 'c1');

      expect(await service.hasConsent(userId, 'c2', ['portfolio:read'])).toBe(true);
      expect(await db.select().from(oauthTokens).where(eq(oauthTokens.clientId, 'c2'))).toHaveLength(1);
    });

    it("a user cannot revoke another user's connections", async () => {
      const userA = await insertUser(db, 'a@example.com');
      const userB = await insertUser(db, 'b@example.com');
      await insertClient('c1');
      await service.recordConsent(userA, 'c1', ['portfolio:read']);
      await insertToken(userA, 'c1', 'access');

      await service.revoke(userB, 'c1');

      expect(await service.hasConsent(userA, 'c1', ['portfolio:read'])).toBe(true);
      expect(
        await db
          .select()
          .from(oauthTokens)
          .where(and(eq(oauthTokens.userId, userA), eq(oauthTokens.clientId, 'c1'))),
      ).toHaveLength(1);
    });
  });

  describe('listWithClients', () => {
    it("lists only the user's consents, most recently used first", async () => {
      const userA = await insertUser(db, 'a@example.com');
      const userB = await insertUser(db, 'b@example.com');
      for (const id of ['old', 'recent', 'other']) await insertClient(id);
      await service.recordConsent(userA, 'old', ['portfolio:read']);
      await service.recordConsent(userA, 'recent', ['portfolio:read']);
      await service.recordConsent(userB, 'other', ['portfolio:read']);
      await db
        .update(oauthGrants)
        .set({ lastUsedAt: new Date('2020-01-01T00:00:00Z') })
        .where(eq(oauthGrants.clientId, 'old'));

      const list = await service.listWithClients(userA);

      expect(list.map((g) => g.clientId)).toEqual(['recent', 'old']);
      expect(itemAt(list, 0).scopes).toEqual(['portfolio:read']);
    });

    it('fetches the client name and URL in the same query, and null if the client no longer exists', async () => {
      const userId = await insertUser(db, 'a@example.com');
      await db.insert(oauthClients).values({
        clientId: 'claude',
        data: { client_id: 'claude', client_name: 'Claude', client_uri: 'https://claude.ai', redirect_uris: [] },
      });
      await service.recordConsent(userId, 'claude', ['portfolio:read']);
      await service.recordConsent(userId, 'borrado', ['portfolio:read']);

      const byId = new Map((await service.listWithClients(userId)).map((g) => [g.clientId, g]));

      expect(byId.get('claude')).toMatchObject({ clientName: 'Claude', clientUri: 'https://claude.ai' });
      expect(byId.get('borrado')).toMatchObject({ clientName: null, clientUri: null });
    });

    it('a user without consents gets an empty list', async () => {
      const userId = await insertUser(db, 'a@example.com');

      expect(await service.listWithClients(userId)).toEqual([]);
    });
  });
});
