import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // `@sextante/core/*` apunta al código fuente (no a `dist/`): los tests no
  // dependen de compilar el core antes. `@/` es el mismo alias que el tsconfig,
  // para poder probar módulos que lo usan.
  resolve: {
    alias: [
      { find: "@sextante/core", replacement: path.resolve(root, "packages/core/src") },
      { find: "@", replacement: path.resolve(root, "src") },
    ],
  },
  test: {
    environment: "node",
    // Los tests del paquete compartido corren con los del frontend: un solo
    // `pnpm test` (y `pnpm test <ruta>`) cubre las dos cosas.
    include: ["src/**/*.test.ts", "packages/*/src/**/*.test.ts"],
  },
});
