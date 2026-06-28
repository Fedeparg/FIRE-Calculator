// @ts-check
import eslint from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * ESLint del backend (NestJS + Drizzle). Independiente del ESLint de la raíz (Next), que
 * ignora `apps/**` a propósito: cada paquete se chequea por separado. Usa el preset
 * "type-checked" de typescript-eslint (apoyado en el tsconfig) para reglas con tipos.
 */
export default tseslint.config(
  {
    ignores: ['dist/**', 'drizzle/**', 'eslint.config.mjs', 'drizzle.config.ts'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      // Nest usa decoradores y DI: algunos patrones disparan falsos positivos.
      '@typescript-eslint/no-extraneous-class': 'off',
      // Promesas "fire-and-forget" deliberadas se marcan con `void`; el resto, error.
      '@typescript-eslint/no-floating-promises': 'error',
    },
  },
);
