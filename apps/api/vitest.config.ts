import { resolve } from 'node:path';

import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/**
 * Vitest configuration for the backend.
 *
 * - `unplugin-swc` compiles the TS with NestJS decorators (legacy + metadata),
 *   like `tsc`/`nest build`; esbuild (Vitest's default transform) does not emit
 *   decorator metadata.
 * - The `@sextante/core` alias points at the package source, so the tests do
 *   not need it compiled to `dist/` first.
 * - `globalSetup` starts ONE ephemeral PostgreSQL (Testcontainers) for the whole
 *   suite and applies the migrations; the URL reaches the tests via `inject`.
 * - `fileParallelism: false`: the files share that single DB, so they run
 *   serially and each one cleans its tables (see `test/db.ts`).
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
  resolve: {
    alias: [{ find: '@sextante/core', replacement: resolve(import.meta.dirname, '../../packages/core/src') }],
  },
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
