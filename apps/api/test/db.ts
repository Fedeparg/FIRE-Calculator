import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { inject } from 'vitest';
import { firstItem } from '@sextante/core/arrays';

import * as schema from '../src/db/schema.js';
import type { Database } from '../src/db/database.module.js';

/**
 * Connection to the test DB (the ephemeral PostgreSQL started in `global-setup.ts`).
 * Each test file opens its own and closes it at the end. ONE connection by default: a test's
 * transactions are serialised. Concurrency tests ask for more (`max`) so that two transactions
 * really run at the same time.
 */
export function createTestDb(options: { max?: number } = {}): { db: Database; close: () => Promise<void> } {
  const client = postgres(inject('databaseUrl'), { max: options.max ?? 1 });
  const db = drizzle(client, { schema });
  return { db, close: () => client.end({ timeout: 5 }) };
}

/**
 * Tables to empty: ALL of those in the `public` schema, read from `pg_tables` (Drizzle's migration
 * bookkeeping table lives in the `drizzle` schema, and any `__drizzle…` is excluded just in case).
 * A new table is covered without touching anything here. They are read once per process: the
 * schema does not change during the tests.
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

/** Quoted SQL identifier (the names come from the catalog, but this way it is always correct). */
const quoteIdent = (name: string): string => `"${name.replaceAll('"', '""')}"`;

/**
 * Empties every table holding domain data between tests to isolate them, in a single statement.
 * `CASCADE` resolves the foreign keys and `RESTART IDENTITY` leaves the DB as freshly migrated.
 *
 * It is ALL the tables on purpose, not just those hanging off `users`: the test files share a
 * single DB (`fileParallelism: false`), so a table without an FK to `users` (`oauth_clients`,
 * `instruments`, `instrument_prices`) would survive the `CASCADE` and leak state into the next
 * file.
 */
export async function resetDb(db: Database): Promise<void> {
  const tables = await listDomainTables(db);
  await db.execute(sql.raw(`TRUNCATE TABLE ${tables.map(quoteIdent).join(', ')} RESTART IDENTITY CASCADE`));
}

/** Inserts a user and returns its id (positions/tokens need a valid FK). */
export async function insertUser(db: Database, email: string): Promise<string> {
  const row = firstItem(await db.insert(schema.users).values({ email }).returning({ id: schema.users.id }));
  return row.id;
}
