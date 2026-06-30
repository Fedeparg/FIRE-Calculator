import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import { inject } from 'vitest';

import * as schema from '../src/db/schema';
import type { Database } from '../src/db/database.module';

/**
 * Conexión a la BD de test (el PostgreSQL efímero levantado en `global-setup.ts`).
 * Cada fichero de test abre la suya y la cierra al terminar.
 */
export function createTestDb(): { db: Database; close: () => Promise<void> } {
  const client = postgres(inject('databaseUrl'), { max: 1 });
  const db = drizzle(client, { schema });
  return { db, close: () => client.end({ timeout: 5 }) };
}

/**
 * Vacía todas las tablas con datos de dominio entre tests para aislarlos. `CASCADE`
 * resuelve las claves foráneas (p. ej. positions → users) y `RESTART IDENTITY` deja
 * la BD como recién migrada.
 */
export async function resetDb(db: Database): Promise<void> {
  await db.execute(sql`
    TRUNCATE TABLE
      positions,
      oauth_tokens,
      oauth_auth_codes,
      oauth_grants,
      login_tokens,
      users
    RESTART IDENTITY CASCADE
  `);
}

/** Inserta un usuario y devuelve su id (las posiciones/tokens necesitan un FK válido). */
export async function insertUser(db: Database, email: string): Promise<string> {
  const [row] = await db
    .insert(schema.users)
    .values({ email })
    .returning({ id: schema.users.id });
  return row.id;
}
