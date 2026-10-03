import { NotFoundException } from '@nestjs/common';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { Database } from '../db/database.module.js';
import { oauthGrants } from '../db/schema.js';
import { createTestDb, insertUser, resetDb } from '../../test/db.js';
import type { SessionUser } from '../auth/auth.service.js';
import { ConsentController } from './consent.controller.js';
import { OAuthClientsStore } from './oauth-clients.store.js';
import { OAuthGrantsService } from './oauth-grants.service.js';

describe('ConsentController (Postgres integration)', () => {
  let db: Database;
  let close: () => Promise<void>;
  let store: OAuthClientsStore;
  let controller: ConsentController;

  beforeAll(() => {
    ({ db, close } = createTestDb());
    store = new OAuthClientsStore(db);
    controller = new ConsentController(store, new OAuthGrantsService(db));
  });

  afterEach(async () => {
    await resetDb(db);
  });

  afterAll(async () => {
    await close();
  });

  it('returns the registered redirect_uris, which the screen uses to validate "Deny"', async () => {
    await store.registerClient({
      client_id: 'client-1',
      client_name: 'Claude',
      redirect_uris: ['https://claude.ai/api/mcp/auth_callback', 'http://localhost:9999/callback'],
    });

    await expect(controller.clientInfo('client-1')).resolves.toEqual({
      clientName: 'Claude',
      clientUri: null,
      redirectUris: ['https://claude.ai/api/mcp/auth_callback', 'http://localhost:9999/callback'],
    });
  });

  it('responds 404 if the client does not exist', async () => {
    await expect(controller.clientInfo('no-existe')).rejects.toBeInstanceOf(NotFoundException);
  });

  describe('approve', () => {
    const user = async (): Promise<SessionUser> => ({
      id: await insertUser(db, 'a@example.com'),
      email: 'a@example.com',
    });

    it('records the consent for a registered client', async () => {
      await store.registerClient({ client_id: 'client-1', redirect_uris: ['https://claude.ai/cb'] });

      await expect(
        controller.approve(await user(), { clientId: 'client-1', scopes: ['portfolio:read'] }),
      ).resolves.toEqual({ ok: true });
      expect(await db.select().from(oauthGrants)).toHaveLength(1);
    });

    it('responds 404 and stores nothing for a client that does not exist (no orphan grants)', async () => {
      await expect(
        controller.approve(await user(), { clientId: 'inventado', scopes: ['portfolio:read'] }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(await db.select().from(oauthGrants)).toHaveLength(0);
    });
  });
});
