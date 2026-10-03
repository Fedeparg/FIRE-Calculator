import type { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { firstItem } from '@sextante/core/arrays';

import type { Database } from '../db/database.module.js';
import { oauthClients } from '../db/schema.js';
import { createTestDb, resetDb } from '../../test/db.js';
import { OAuthClientsStore } from './oauth-clients.store.js';

const CLIENT: OAuthClientInformationFull = {
  client_id: 'client-1',
  redirect_uris: ['http://localhost:9999/callback'],
};

describe('OAuthClientsStore (Postgres integration)', () => {
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
    firstItem(await db.select().from(oauthClients).where(eq(oauthClients.clientId, clientId)));

  it('registers a new client with lastUsedAt set to null', async () => {
    await store.registerClient(CLIENT);

    const row = await readClient(CLIENT.client_id);
    expect(row.data.client_id).toBe(CLIENT.client_id);
    expect(row.lastUsedAt).toBeNull();
  });

  it('touch writes lastUsedAt (what the reaper relies on to avoid purging live clients)', async () => {
    await store.registerClient(CLIENT);
    const before = Date.now();

    await store.touch(CLIENT.client_id);

    const row = await readClient(CLIENT.client_id);
    expect(row.lastUsedAt).not.toBeNull();
    expect(row.lastUsedAt?.getTime()).toBeGreaterThanOrEqual(before - 1_000);
  });

  it('touch on a missing client does not throw (it is called fire-and-forget)', async () => {
    await expect(store.touch('no-existe')).resolves.toBeUndefined();
  });

  it('re-registration updates the data without deleting the row', async () => {
    await store.registerClient(CLIENT);
    await store.touch(CLIENT.client_id);

    await store.registerClient({ ...CLIENT, client_name: 'Cliente renombrado' });

    const row = await readClient(CLIENT.client_id);
    expect(row.data.client_name).toBe('Cliente renombrado');
    expect(row.lastUsedAt).not.toBeNull();
  });
});
