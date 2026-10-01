import { resolve } from 'node:path';

import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

import { parseDatabaseEnv } from '../config/env.js';

/**
 * Migrador del servicio one-shot `migrate` de Compose. Usa `drizzle-orm` (no `drizzle-kit`)
 * para funcionar en la imagen de runtime; la API espera a que termine OK.
 */
async function main(): Promise<void> {
  // Mismo esquema que la API, pero solo `DATABASE_URL`: el migrador no necesita JWT, email, etc.
  const { DATABASE_URL } = parseDatabaseEnv(process.env);

  const client = postgres(DATABASE_URL, { max: 1 });
  const db = drizzle(client);

  // Relativa a este archivo (dist/db/migrate.js -> ../../drizzle).
  const migrationsFolder = resolve(import.meta.dirname, '../../drizzle');

  try {
    console.log(`Aplicando migraciones desde ${migrationsFolder}...`);
    await migrate(db, { migrationsFolder });
    console.log('Migraciones aplicadas correctamente.');
  } finally {
    await client.end({ timeout: 5 });
  }
}

main().catch((error: unknown) => {
  console.error('Fallo al aplicar migraciones:', error);
  process.exit(1);
});
