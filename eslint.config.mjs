import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Artefactos de build anidados (p. ej. worktrees temporales de agentes bajo
    // `.claude/`): evita que ESLint analice `.next/`/`out/`/`build/` generados
    // fuera de la raíz y reporte miles de falsos positivos.
    "**/.next/**",
    "**/out/**",
    "**/build/**",
    ".claude/**",
    // El backend (apps/api) tiene su propio tooling (NestJS/Drizzle); no lo
    // analiza el ESLint del frontend Next.
    "apps/**",
    // Salida compilada de los paquetes compartidos (su código fuente sí se analiza).
    "packages/*/dist/**",
  ]),
]);

export default eslintConfig;
