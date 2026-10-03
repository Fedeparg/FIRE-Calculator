import { afterEach, describe, expect, inject, it } from 'vitest';
import { firstItem } from '@sextante/core/arrays';

import { fakeConfig } from '../../test/config.js';
import { createPgClient } from './database.module.js';

describe('createPgClient', () => {
  let client: ReturnType<typeof createPgClient> | undefined;

  afterEach(async () => {
    await client?.end({ timeout: 1 });
    client = undefined;
  });

  it('applies the default statement_timeout (30 s) to every session', async () => {
    client = createPgClient(fakeConfig({ DATABASE_URL: inject('databaseUrl') }));

    const row = firstItem(await client<{ statement_timeout: string }[]>`show statement_timeout`);

    expect(row.statement_timeout).toBe('30s');
  });

  it('cancels a query that exceeds the configured statement_timeout', async () => {
    client = createPgClient(fakeConfig({ DATABASE_URL: inject('databaseUrl'), DB_STATEMENT_TIMEOUT_MS: '50' }));

    await expect(client`select pg_sleep(1)`).rejects.toThrow(/statement timeout/);
  });

  it('sets no limit with 0', async () => {
    client = createPgClient(fakeConfig({ DATABASE_URL: inject('databaseUrl'), DB_STATEMENT_TIMEOUT_MS: '0' }));

    const row = firstItem(await client<{ statement_timeout: string }[]>`show statement_timeout`);

    expect(row.statement_timeout).toBe('0');
  });
});
