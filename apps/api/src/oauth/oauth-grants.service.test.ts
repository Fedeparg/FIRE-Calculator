import { randomBytes } from 'node:crypto';

import { and, eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { Database } from '../db/database.module.js';
import { oauthClients, oauthGrants, oauthTokens } from '../db/schema.js';
import { createTestDb, insertUser, resetDb } from '../../test/db.js';
import { OAuthGrantsService } from './oauth-grants.service.js';
import { firstItem, itemAt } from '@sextante/core/arrays';

const randomHash = (): string => randomBytes(16).toString('hex');

describe('OAuthGrantsService (integración con Postgres)', () => {
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
    it('sin consentimiento previo, hasConsent es false', async () => {
      const userId = await insertUser(db, 'a@example.com');
      await insertClient('c1');

      expect(await service.hasConsent(userId, 'c1', ['portfolio:read'])).toBe(false);
    });

    it('solo cubre los scopes concedidos: pedir uno más exige consentir de nuevo', async () => {
      const userId = await insertUser(db, 'a@example.com');
      await insertClient('c1');
      await service.recordConsent(userId, 'c1', ['portfolio:read']);

      expect(await service.hasConsent(userId, 'c1', ['portfolio:read'])).toBe(true);
      expect(await service.hasConsent(userId, 'c1', ['portfolio:read', 'portfolio:write'])).toBe(false);
    });

    it('el consentimiento es por usuario y por cliente', async () => {
      const userA = await insertUser(db, 'a@example.com');
      const userB = await insertUser(db, 'b@example.com');
      await insertClient('c1');
      await insertClient('c2');
      await service.recordConsent(userA, 'c1', ['portfolio:read']);

      expect(await service.hasConsent(userB, 'c1', ['portfolio:read'])).toBe(false);
      expect(await service.hasConsent(userA, 'c2', ['portfolio:read'])).toBe(false);
    });

    it('un nuevo consentimiento se UNE al anterior (step-up) sin duplicar la fila', async () => {
      const userId = await insertUser(db, 'a@example.com');
      await insertClient('c1');
      await service.recordConsent(userId, 'c1', ['portfolio:read']);
      await service.recordConsent(userId, 'c1', ['portfolio:write', 'portfolio:read']);

      const rows = await db.select().from(oauthGrants).where(eq(oauthGrants.userId, userId));
      expect(rows).toHaveLength(1);
      // Orden de concesión, sin duplicados.
      expect(itemAt(rows, 0).scopes).toEqual(['portfolio:read', 'portfolio:write']);
      expect(itemAt(rows, 0).lastUsedAt).not.toBeNull();
    });

    it('dos aprobaciones simultáneas dejan UNA fila con la unión de ambas, sin error', async () => {
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
    it('actualiza lastUsedAt solo del consentimiento indicado', async () => {
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
    it('borra el consentimiento y todos los tokens (access y refresh) de ese cliente', async () => {
      const userId = await insertUser(db, 'a@example.com');
      await insertClient('c1');
      await service.recordConsent(userId, 'c1', ['portfolio:read']);
      await insertToken(userId, 'c1', 'access');
      await insertToken(userId, 'c1', 'refresh');

      await service.revoke(userId, 'c1');

      expect(await service.hasConsent(userId, 'c1', ['portfolio:read'])).toBe(false);
      expect(await db.select().from(oauthTokens).where(eq(oauthTokens.userId, userId))).toEqual([]);
    });

    it('no toca los consentimientos ni los tokens de otro cliente del mismo usuario', async () => {
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

    it('un usuario no puede revocar las conexiones de otro', async () => {
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
    it('solo lista los consentimientos del usuario, los usados más recientemente primero', async () => {
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

    it('trae el nombre y la URL del cliente en la misma consulta, y null si el cliente ya no existe', async () => {
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

    it('un usuario sin consentimientos recibe una lista vacía', async () => {
      const userId = await insertUser(db, 'a@example.com');

      expect(await service.listWithClients(userId)).toEqual([]);
    });
  });
});
