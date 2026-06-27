import { defineConfig } from 'drizzle-kit';

/**
 * Configuración de drizzle-kit (generación y aplicación de migraciones).
 * Las migraciones son versionadas y viven en `./drizzle`.
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
