import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  // Mismo alias `@/` que el tsconfig, para poder probar módulos que lo usan.
  resolve: { alias: { "@": path.resolve(path.dirname(fileURLToPath(import.meta.url)), "src") } },
  test: {
    environment: "node",
    // Los tests del paquete compartido corren con los del frontend: un solo
    // `pnpm test` (y `pnpm test <ruta>`) cubre las dos cosas.
    include: ["src/**/*.test.ts", "packages/*/src/**/*.test.ts"],
  },
});
