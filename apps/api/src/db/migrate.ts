import { resolve } from 'node:path';

import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

/**
 * Migrador programático para el servicio one-shot `migrate` de Docker Compose.
 *
 * Usa solo `drizzle-orm` (dependencia de producción), NO `drizzle-kit`, por lo que
 * funciona en la imagen de runtime. Aplica las migraciones de `./drizzle` y sale.
 * La API depende de que este servicio termine OK (`service_completed_successfully`),
 * así que un arranque limpio nunca queda con la BD sin esquema.
 */
async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL no está definida');
  }

  // Una sola conexión: el migrador es secuencial y de vida corta.
  const client = postgres(url, { max: 1 });
  const db = drizzle(client);

  // Carpeta de migraciones, resuelta de forma robusta respecto a este archivo
  // (dist/db/migrate.js -> ../../drizzle).
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
