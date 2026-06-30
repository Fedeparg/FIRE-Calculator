import { resolve } from 'node:path';

import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

// `provide` publica valores serializables a los workers (que los leen con
// `inject`). Se tipa inline para no importar tipos ESM de `vitest/node` (el
// `module: node16` exigiría una `resolution-mode` que complica el setup).
type Provide = (key: 'databaseUrl', value: string) => void;

/**
 * Levanta un PostgreSQL efímero (misma versión mayor que producción) una sola vez
 * para toda la suite, aplica las migraciones reales de `./drizzle` y publica la
 * URL de conexión a los tests con `provide` (los workers la leen con `inject`).
 * Al terminar, para y elimina el contenedor.
 */
export default async function setup({ provide }: { provide: Provide }) {
  const container = await new PostgreSqlContainer('postgres:17-alpine').start();
  const url = container.getConnectionUri();

  const client = postgres(url, { max: 1 });
  try {
    await migrate(drizzle(client), {
      migrationsFolder: resolve(__dirname, '../drizzle'),
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
