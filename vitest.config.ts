import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

// `@sextante/core/*` points at the source (not `dist/`): tests do not depend on
// building core first. `@/` is the same alias as in tsconfig, so modules that
// use it can be tested.
const resolve = {
  alias: [
    { find: "@sextante/core", replacement: path.resolve(root, "packages/core/src") },
    { find: "@", replacement: path.resolve(root, "src") },
  ],
};

export default defineConfig({
  resolve,
  test: {
    // Two projects: logic (`*.test.ts`) runs in Node without a DOM, and component and hook tests
    // (`*.test.tsx`) run in jsdom with Testing Library. Splitting them keeps the pure suite fast
    // and stops a logic test from accidentally depending on `window`.
    projects: [
      {
        resolve,
        test: {
          name: "node",
          environment: "node",
          // The shared package's tests run alongside the frontend's: a single
          // `pnpm test` (and `pnpm test <path>`) covers both.
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
          // `next-intl/navigation` imports `next/navigation` without an extension, which Node ESM
          // cannot resolve (Next declares no `exports`); processing it through Vite resolves it.
          server: { deps: { inline: ["next-intl"] } },
        },
      },
    ],
  },
});
