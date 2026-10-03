import { resolve } from 'node:path';

import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

// `provide` publishes serialisable values to the workers (which read them with
// `inject`). It is typed inline instead of importing `TestProject` from `vitest/node`
// because the method is destructured here: typing it as the class would invite
// passing it around detached and losing `this`.
type Provide = (key: 'databaseUrl', value: string) => void;

/**
 * Starts an ephemeral PostgreSQL (same major version as production) once for the
 * whole suite, applies the real migrations from `./drizzle` and publishes the
 * connection URL to the tests with `provide` (the workers read it with `inject`).
 * At the end, it stops and removes the container.
 */
export default async function setup({ provide }: { provide: Provide }) {
  const container = await new PostgreSqlContainer('postgres:17-alpine').start();
  const url = container.getConnectionUri();

  const client = postgres(url, { max: 1 });
  try {
    await migrate(drizzle(client), {
      migrationsFolder: resolve(import.meta.dirname, '../drizzle'),
    });
  } finally {
    await client.end({ timeout: 5 });
  }

  provide('databaseUrl', url);

  return async () => {
    await container.stop();
  };
}

declare module 'vitest' {
  interface ProvidedContext {
    databaseUrl: string;
  }
}
