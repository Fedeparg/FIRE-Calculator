import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Los tests del paquete compartido corren con los del frontend: un solo
    // `pnpm test` (y `pnpm test <ruta>`) cubre las dos cosas.
    include: ["src/**/*.test.ts", "packages/*/src/**/*.test.ts"],
  },
});
