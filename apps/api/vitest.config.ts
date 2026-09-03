import { resolve } from 'node:path';

import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/**
 * Configuración de Vitest para el backend.
 *
 * - `unplugin-swc` compila el TS con decoradores de NestJS (legacy + metadata),
 *   igual que `tsc`/`nest build`; esbuild (el transform por defecto de Vitest) no
 *   emite metadata de decoradores.
 * - `globalSetup` levanta UN PostgreSQL efímero (Testcontainers) para toda la
 *   suite y aplica las migraciones; la URL se pasa a los tests vía `inject`.
 * - `fileParallelism: false`: los ficheros comparten esa única BD, así que se
 *   ejecutan en serie y cada uno limpia sus tablas (ver `test/db.ts`).
 */
export default defineConfig({
  plugins: [
    swc.vite({
      jsc: {
        target: 'es2023',
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: [resolve(import.meta.dirname, 'test/setup.ts')],
    globalSetup: [resolve(import.meta.dirname, 'test/global-setup.ts')],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
