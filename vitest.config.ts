import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

// `@sextante/core/*` apunta al código fuente (no a `dist/`): los tests no
// dependen de compilar el core antes. `@/` es el mismo alias que el tsconfig,
// para poder probar módulos que lo usan.
const resolve = {
  alias: [
    { find: "@sextante/core", replacement: path.resolve(root, "packages/core/src") },
    { find: "@", replacement: path.resolve(root, "src") },
  ],
};

export default defineConfig({
  resolve,
  test: {
    // Dos proyectos: la lógica (`*.test.ts`) corre en Node, sin DOM, y los tests de componentes
    // y hooks (`*.test.tsx`) en jsdom con Testing Library. Separarlos mantiene rápida la suite
    // pura y evita que un test de lógica dependa sin querer de `window`.
    projects: [
      {
        resolve,
        test: {
          name: "node",
          environment: "node",
          // Los tests del paquete compartido corren con los del frontend: un solo
          // `pnpm test` (y `pnpm test <ruta>`) cubre las dos cosas.
          include: ["src/**/*.test.ts", "packages/*/src/**/*.test.ts"],
        },
      },
      {
        resolve,
        test: {
          name: "dom",
          environment: "jsdom",
          include: ["src/**/*.test.tsx"],
          setupFiles: ["src/test/setup-dom.ts"],
        },
      },
    ],
  },
});
