import type { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { Database } from '../db/database.module';
import { oauthClients } from '../db/schema';
import { createTestDb, resetDb } from '../../test/db';
import { OAuthClientsStore } from './oauth-clients.store';

const CLIENT: OAuthClientInformationFull = {
  client_id: 'client-1',
  redirect_uris: ['http://localhost:9999/callback'],
};

describe('OAuthClientsStore (integración con Postgres)', () => {
  let db: Database;
  let close: () => Promise<void>;
  let store: OAuthClientsStore;

  beforeAll(() => {
    ({ db, close } = createTestDb());
    store = new OAuthClientsStore(db);
  });

  afterEach(async () => {
    await resetDb(db);
  });

  afterAll(async () => {
    await close();
  });

  const readClient = async (clientId: string) =>
    (await db.select().from(oauthClients).where(eq(oauthClients.clientId, clientId)))[0];

  it('registra un cliente nuevo con lastUsedAt a null', async () => {
    await store.registerClient(CLIENT);

    const row = await readClient(CLIENT.client_id);
    expect(row.data.client_id).toBe(CLIENT.client_id);
    expect(row.lastUsedAt).toBeNull();
  });

  it('touch escribe lastUsedAt (es de lo que depende el reaper para no purgar clientes vivos)', async () => {
    await store.registerClient(CLIENT);
    const before = Date.now();

    await store.touch(CLIENT.client_id);

    const row = await readClient(CLIENT.client_id);
    expect(row.lastUsedAt).not.toBeNull();
    expect(row.lastUsedAt!.getTime()).toBeGreaterThanOrEqual(before - 1_000);
  });

  it('touch de un cliente inexistente no lanza (se invoca fire-and-forget)', async () => {
    await expect(store.touch('no-existe')).resolves.toBeUndefined();
  });

  it('el re-registro actualiza los datos sin borrar la fila', async () => {
    await store.registerClient(CLIENT);
    await store.touch(CLIENT.client_id);

    await store.registerClient({ ...CLIENT, client_name: 'Cliente renombrado' });

    const row = await readClient(CLIENT.client_id);
    expect(row.data.client_name).toBe('Cliente renombrado');
    expect(row.lastUsedAt).not.toBeNull();
  });
});
