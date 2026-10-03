// @ts-check
import eslint from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Backend ESLint (NestJS + Drizzle). Independent of the root ESLint (Next), which ignores
 * `apps/**` on purpose: each package is checked separately. Uses the typescript-eslint
 * "type-checked" preset (backed by the tsconfig) for type-aware rules.
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
      // Nest uses decorators and DI: some patterns trigger false positives.
      '@typescript-eslint/no-extraneous-class': 'off',
      // Deliberate "fire-and-forget" promises are marked with `void`; anything else is an error.
      '@typescript-eslint/no-floating-promises': 'error',
      // Same trio as the root. `consistent-type-imports` does not report in files with decorators
      // (with `emitDecoratorMetadata`, Nest's injection needs the import at runtime).
      '@typescript-eslint/consistent-type-imports': ['error', { disallowTypeAnnotations: false }],
      '@typescript-eslint/no-non-null-assertion': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
    },
  },
);
