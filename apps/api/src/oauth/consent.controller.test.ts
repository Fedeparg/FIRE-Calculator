import { NotFoundException } from '@nestjs/common';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { Database } from '../db/database.module.js';
import { createTestDb, resetDb } from '../../test/db.js';
import { ConsentController } from './consent.controller.js';
import { OAuthClientsStore } from './oauth-clients.store.js';
import type { OAuthGrantsService } from './oauth-grants.service.js';

describe('ConsentController (integración con Postgres)', () => {
  let db: Database;
  let close: () => Promise<void>;
  let store: OAuthClientsStore;
  let controller: ConsentController;

  beforeAll(() => {
    ({ db, close } = createTestDb());
    store = new OAuthClientsStore(db);
    // `clientInfo` no toca los grants.
    controller = new ConsentController(store, {} as OAuthGrantsService);
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
});
