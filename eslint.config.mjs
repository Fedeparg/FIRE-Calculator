import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Layer boundaries (see "Dónde va cada cosa" — where each thing goes — in CLAUDE.md):
//   app → features → shared, never the other way round; `packages/core` knows nothing of `src/`.
const FEATURES = [
  "account",
  "auth",
  "calculators",
  "changelog",
  "donations",
  "landing",
  "oauth",
  "portfolio",
  "scenarios",
  "wiki",
];

// Deliberately allowed dependencies between features (importer → imported).
// Everything else fails lint. If you need to add one, first consider moving the
// shared code to `src/shared`.
const FEATURE_EXCEPTIONS = {
  // A calculator page embeds the saved-scenarios panel.
  calculators: ["scenarios"],
  // The portfolio goal reuses saved scenarios.
  portfolio: ["scenarios"],
  // The landing page composes the donations widget.
  landing: ["donations"],
  // The calculator → wiki articles map is keyed by the catalogue's typed slug.
  wiki: ["calculators"],
};

const NEXT_LINK = {
  name: "next/link",
  message: "Use `Link` from `@/i18n/navigation` to keep the locale prefix.",
};

// zod is server-only (MCP): core's schemas live in `*.schema.ts` and in the `calculators/schemas`
// registry precisely so that the frontend does not drag them into the client bundle.
const CORE_SERVER_ONLY = {
  group: ["@sextante/core/**/*.schema", "@sextante/core/**/schema-helpers", "@sextante/core/calculators/schemas"],
  message:
    "Core's zod schemas are server-only (MCP): importing them puts zod in the client bundle. " +
    "The frontend uses the calculator's types and `compute*` functions.",
};

const restrictImports = (groups) => ({
  "no-restricted-imports": ["error", { paths: [NEXT_LINK], patterns: [...groups, CORE_SERVER_ONLY] }],
});

const featureBoundaries = FEATURES.map((feature) => {
  const allowed = FEATURE_EXCEPTIONS[feature] ?? [];
  const forbidden = FEATURES.filter((other) => other !== feature && !allowed.includes(other));
  return {
    files: [`src/features/${feature}/**/*.{ts,tsx}`],
    rules: restrictImports([
      {
        group: ["@/app/**"],
        message: "A feature does not import from `src/app`: routes compose features.",
      },
      {
        group: forbidden.map((other) => `@/features/${other}{,/**}`),
        message:
          "A feature does not import from another one except for the exceptions listed in FEATURE_EXCEPTIONS. Move shared code to `src/shared`.",
      },
    ]),
  };
});

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Goes before the other `src/` import rules: each of them already includes this pattern
  // (ESLint does not merge the options of the same rule; the last one that applies wins).
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: { "no-restricted-imports": ["error", { patterns: [CORE_SERVER_ONLY] }] },
  },
  ...featureBoundaries,
  {
    files: ["src/shared/**/*.{ts,tsx}"],
    rules: restrictImports([
      {
        group: ["@/features/**", "@/app/**"],
        message: "`src/shared` depends on no features or routes: inject whatever is missing through props.",
      },
    ]),
  },
  {
    files: ["packages/core/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/**", "**/src/**", "next", "next/**", "react", "react/**"],
              message:
                "`packages/core` is pure logic shared with the API: it imports neither from `src/` nor from Next/React.",
            },
          ],
        },
      ],
    },
  },
  // HTTP access lives in `shared/api` (client), in each feature's `api*.ts` and in
  // server components/pages; pure UI consumes hooks, not `fetch`.
  {
    files: ["src/features/**/components/**/*.{ts,tsx}", "src/shared/{ui,charts,layout}/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-globals": [
        "error",
        {
          name: "fetch",
          message: "Components do not call `fetch`: use `shared/api` or the feature's `api.ts`.",
        },
      ],
    },
  },
  // Visible text is ALWAYS translated: JSX text with letters in a feature component is a hand-written
  // UI string (see "Todo el texto visible va traducido" — all visible text is translated — in
  // CLAUDE.md). It goes through `next-intl` (`t("…")`) or, for amounts, `useFormat`. Symbols with no
  // letters (·, /, →) pass.
  {
    files: ["src/features/**/components/**/*.tsx"],
    ignores: ["**/*.test.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXText[value=/\\p{L}/u]",
          message: "Hard-coded UI text: use an i18n key (`t(...)`) in es.json and en.json.",
        },
      ],
    },
  },
  // Syntactic rules (no type information, to keep CI lint fast):
  // - `consistent-type-imports`: type-only imports are marked `import type`, so the bundler drops
  //   them without relying on heuristics and what is runtime is visible at a glance.
  // - `no-non-null-assertion`: a `!` silences the compiler without checking anything; with
  //   `noUncheckedIndexedAccess`, use guards or `itemAt`/`firstItem` from `@sextante/core/arrays`.
  // - `eqeqeq`: always `===`, except for the `x == null` idiom (null or undefined at once).
  {
    files: ["src/**/*.{ts,tsx}", "packages/**/*.ts"],
    rules: {
      // `import()` in annotations is allowed: it is the `vi.mock(…, importOriginal<typeof import(…)>)` pattern.
      "@typescript-eslint/consistent-type-imports": ["error", { disallowTypeAnnotations: false }],
      "@typescript-eslint/no-non-null-assertion": "error",
      eqeqeq: ["error", "always", { null: "ignore" }],
    },
  },
  // Component size: above ~300 effective lines it is worth extracting a hook or a
  // subcomponent.
  {
    files: ["src/**/*.tsx"],
    ignores: ["**/*.test.tsx"],
    rules: {
      "max-lines": ["error", { max: 300, skipBlankLines: true, skipComments: true }],
    },
  },
  // `.ts` module size: above ~400 effective lines a module usually mixes responsibilities (the
  // largest logic module, `fiscal/realised-gains.ts`, is around 260). Excluded are tests (a long
  // `describe` is not a design problem), data tables and the declarative registry of calculator
  // schemas, which grow with the product rather than with the logic.
  {
    files: ["src/**/*.ts", "packages/**/*.ts"],
    ignores: [
      "**/*.test.ts",
      "**/test-support/**",
      "packages/core/src/data/**",
      "packages/core/src/calculators/schemas.ts",
    ],
    rules: {
      "max-lines": ["error", { max: 400, skipBlankLines: true, skipComments: true }],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Nested build artifacts (e.g. temporary agent worktrees under `.claude/`): keeps
    // ESLint from analysing `.next/`/`out/`/`build/` generated outside the root and
    // reporting thousands of false positives.
    "**/.next/**",
    "**/out/**",
    "**/build/**",
    ".claude/**",
    // The backend (apps/api) has its own tooling (NestJS/Drizzle); the Next
    // frontend's ESLint does not analyse it.
    "apps/**",
    // Compiled output of the shared packages (their source is analysed).
    "packages/*/dist/**",
  ]),
]);

export default eslintConfig;
