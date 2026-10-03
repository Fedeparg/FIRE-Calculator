import { firstItem } from '@sextante/core/arrays';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { inject } from 'vitest';

import * as schema from '../src/db/schema.js';
import type { Database } from '../src/db/database.module.js';

/**
 * Conexión a la BD de test (el PostgreSQL efímero levantado en `global-setup.ts`).
 * Cada fichero de test abre la suya y la cierra al terminar. Por defecto UNA conexión: las
 * transacciones de un test se serializan. Los tests de concurrencia piden más (`max`) para que
 * dos transacciones corran de verdad a la vez.
 */
export function createTestDb(options: { max?: number } = {}): { db: Database; close: () => Promise<void> } {
  const client = postgres(inject('databaseUrl'), { max: options.max ?? 1 });
  const db = drizzle(client, { schema });
  return { db, close: () => client.end({ timeout: 5 }) };
}

/**
 * Tablas a vaciar: TODAS las del esquema `public`, leídas de `pg_tables` (la tabla de control de
 * migraciones de Drizzle vive en el esquema `drizzle`, y por si acaso se excluye cualquier
 * `__drizzle…`). Una tabla nueva queda cubierta sin tocar nada aquí. Se leen una vez por proceso:
 * el esquema no cambia durante los tests.
 */
let domainTables: Promise<string[]> | undefined;

function listDomainTables(db: Database): Promise<string[]> {
  domainTables ??= db
    .execute<{ tablename: string }>(
      sql`select tablename from pg_tables where schemaname = 'public' and not starts_with(tablename, '__drizzle') order by tablename`,
    )
    .then((rows) => rows.map((row) => row.tablename));
  return domainTables;
}

/** Identificador SQL entrecomillado (los nombres vienen del catálogo, pero así es correcto siempre). */
const quoteIdent = (name: string): string => `"${name.replaceAll('"', '""')}"`;

/**
 * Vacía todas las tablas con datos de dominio entre tests para aislarlos, en una sola sentencia.
 * `CASCADE` resuelve las claves foráneas y `RESTART IDENTITY` deja la BD como recién migrada.
 *
 * Son TODAS las tablas a propósito, no solo las que cuelgan de `users`: los ficheros de test
 * comparten una única BD (`fileParallelism: false`), así que una tabla sin FK a `users`
 * —`oauth_clients`, `instruments`, `instrument_prices`— sobreviviría al `CASCADE` y filtraría
 * estado al siguiente fichero.
 */
export async function resetDb(db: Database): Promise<void> {
  const tables = await listDomainTables(db);
  await db.execute(sql.raw(`TRUNCATE TABLE ${tables.map(quoteIdent).join(', ')} RESTART IDENTITY CASCADE`));
}

/** Inserta un usuario y devuelve su id (las posiciones/tokens necesitan un FK válido). */
export async function insertUser(db: Database, email: string): Promise<string> {
  const row = firstItem(await db.insert(schema.users).values({ email }).returning({ id: schema.users.id }));
  return row.id;
}
