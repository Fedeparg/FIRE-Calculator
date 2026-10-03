import { NotFoundException } from '@nestjs/common';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { Database } from '../db/database.module.js';
import { oauthGrants } from '../db/schema.js';
import { createTestDb, insertUser, resetDb } from '../../test/db.js';
import type { SessionUser } from '../auth/auth.service.js';
import { ConsentController } from './consent.controller.js';
import { OAuthClientsStore } from './oauth-clients.store.js';
import { OAuthGrantsService } from './oauth-grants.service.js';

describe('ConsentController (integración con Postgres)', () => {
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

  it('devuelve las redirect_uris registradas, que la pantalla usa para validar "Denegar"', async () => {
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

  it('responde 404 si el cliente no existe', async () => {
    await expect(controller.clientInfo('no-existe')).rejects.toBeInstanceOf(NotFoundException);
  });

  describe('approve', () => {
    const user = async (): Promise<SessionUser> => ({
      id: await insertUser(db, 'a@example.com'),
      email: 'a@example.com',
    });

    it('registra el consentimiento de un cliente registrado', async () => {
      await store.registerClient({ client_id: 'client-1', redirect_uris: ['https://claude.ai/cb'] });

      await expect(
        controller.approve(await user(), { clientId: 'client-1', scopes: ['portfolio:read'] }),
      ).resolves.toEqual({ ok: true });
      expect(await db.select().from(oauthGrants)).toHaveLength(1);
    });

    it('responde 404 y no guarda nada para un cliente que no existe (sin grants huérfanos)', async () => {
      await expect(
        controller.approve(await user(), { clientId: 'inventado', scopes: ['portfolio:read'] }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(await db.select().from(oauthGrants)).toHaveLength(0);
    });
  });
});
