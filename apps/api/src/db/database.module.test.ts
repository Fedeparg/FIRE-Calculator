import { afterEach, describe, expect, inject, it } from 'vitest';

import { fakeConfig } from '../../test/config.js';
import { createPgClient } from './database.module.js';

describe('createPgClient', () => {
  let client: ReturnType<typeof createPgClient> | undefined;

  afterEach(async () => {
    await client?.end({ timeout: 1 });
    client = undefined;
  });

  it('aplica el statement_timeout por defecto (30 s) a cada sesión', async () => {
    client = createPgClient(fakeConfig({ DATABASE_URL: inject('databaseUrl') }));

    const [row] = await client<{ statement_timeout: string }[]>`show statement_timeout`;

    expect(row.statement_timeout).toBe('30s');
  });

  it('corta una consulta que supera el statement_timeout configurado', async () => {
    client = createPgClient(fakeConfig({ DATABASE_URL: inject('databaseUrl'), DB_STATEMENT_TIMEOUT_MS: '50' }));

    await expect(client`select pg_sleep(1)`).rejects.toThrow(/statement timeout/);
  });

  it('con 0 no fija ningún límite', async () => {
    client = createPgClient(fakeConfig({ DATABASE_URL: inject('databaseUrl'), DB_STATEMENT_TIMEOUT_MS: '0' }));

    const [row] = await client<{ statement_timeout: string }[]>`show statement_timeout`;

    expect(row.statement_timeout).toBe('0');
  });
});
