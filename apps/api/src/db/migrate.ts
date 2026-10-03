import { resolve } from 'node:path';

import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

import { parseDatabaseEnv } from '../config/env.js';

/**
 * Migrator for the one-shot Compose `migrate` service. Uses `drizzle-orm` (not `drizzle-kit`)
 * so it works in the runtime image; the API waits for it to finish successfully.
 */
async function main(): Promise<void> {
  // Same schema as the API, but only `DATABASE_URL`: the migrator needs no JWT, email, etc.
  const { DATABASE_URL } = parseDatabaseEnv(process.env);

  const client = postgres(DATABASE_URL, { max: 1 });
  const db = drizzle(client);

  // Relative to this file (dist/db/migrate.js -> ../../drizzle).
  const migrationsFolder = resolve(import.meta.dirname, '../../drizzle');

  try {
    console.log(`Applying migrations from ${migrationsFolder}...`);
    await migrate(db, { migrationsFolder });
    console.log('Migrations applied successfully.');
  } finally {
    await client.end({ timeout: 5 });
  }
}

main().catch((error: unknown) => {
  console.error('Failed to apply migrations:', error);
  process.exit(1);
});
