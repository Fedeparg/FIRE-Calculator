import { defineConfig } from 'drizzle-kit';

/**
 * drizzle-kit configuration (generating and applying migrations).
 * Migrations are versioned and live in `./drizzle`.
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
  strict: true,
  verbose: true,
});
