import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Fronteras de capas (ver "Dónde va cada cosa" en CLAUDE.md):
//   app → features → shared, nunca al revés; `packages/core` no conoce `src/`.
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

// Dependencias entre features permitidas a propósito (quien importa → de quién).
// Todo lo demás falla en lint. Si necesitas añadir una, primero valora mover el
// código común a `src/shared`.
const FEATURE_EXCEPTIONS = {
  // La página de una calculadora incrusta el panel de escenarios guardados.
  calculators: ["scenarios"],
  // El objetivo de la cartera reutiliza los escenarios guardados.
  portfolio: ["scenarios"],
  // La landing compone el widget de donaciones.
  landing: ["donations"],
  // El mapa calculadora → artículos de la wiki se indexa por el slug tipado del catálogo.
  wiki: ["calculators"],
};

const NEXT_LINK = {
  name: "next/link",
  message: "Usa `Link` de `@/i18n/navigation` para conservar el prefijo de idioma.",
};

// zod solo lo usa el servidor (MCP): los esquemas de core viven en `*.schema.ts` y en el registro
// `calculators/schemas` precisamente para que el frontend no los arrastre al bundle del cliente.
const CORE_SERVER_ONLY = {
  group: ["@sextante/core/**/*.schema", "@sextante/core/**/schema-helpers", "@sextante/core/calculators/schemas"],
  message:
    "Los esquemas zod de core son solo del servidor (MCP): importarlos mete zod en el bundle del cliente. " +
    "El frontend usa los tipos y las funciones `compute*` de la calculadora.",
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
        message: "Una feature no importa de `src/app`: las rutas componen las features.",
      },
      {
        group: forbidden.map((other) => `@/features/${other}{,/**}`),
        message:
          "Una feature no importa de otra salvo excepciones listadas en FEATURE_EXCEPTIONS. Mueve lo común a `src/shared`.",
      },
    ]),
  };
});

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Va antes que las demás reglas de imports de `src/`: cada una de ellas ya incluye este patrón
  // (ESLint no fusiona las opciones de una misma regla, gana la última que aplica).
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
        message: "`src/shared` no depende de features ni de rutas: inyecta lo que falte por props.",
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
              message: "`packages/core` es lógica pura compartida con la API: no importa de `src/` ni de Next/React.",
            },
          ],
        },
      ],
    },
  },
  // El acceso HTTP vive en `shared/api` (cliente), en los `api*.ts` de cada feature y
  // en server components/páginas; la UI pura consume hooks, no `fetch`.
  {
    files: ["src/features/**/components/**/*.{ts,tsx}", "src/shared/{ui,charts,layout}/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-globals": [
        "error",
        {
          name: "fetch",
          message: "Los componentes no llaman a `fetch`: usa `shared/api` o el `api.ts` de la feature.",
        },
      ],
    },
  },
  // Texto visible SIEMPRE traducido: un texto JSX con letras en un componente de feature es una
  // cadena de UI escrita a mano (ver "Todo el texto visible va traducido" en CLAUDE.md). Va por
  // `next-intl` (`t("…")`) o, si es un importe, por `useFormat`. Símbolos sin letras (·, /, →) pasan.
  {
    files: ["src/features/**/components/**/*.tsx"],
    ignores: ["**/*.test.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXText[value=/\\p{L}/u]",
          message: "Texto de UI hardcodeado: usa una clave de i18n (`t(...)`) en es.json y en.json.",
        },
      ],
    },
  },
  // Reglas sintácticas (sin información de tipos, para no alargar el lint de CI):
  // - `consistent-type-imports`: los imports solo de tipos se marcan `import type`, así el bundler
  //   los descarta sin depender de la heurística y se ve a la vista qué es runtime.
  // - `no-non-null-assertion`: un `!` silencia al compilador sin comprobar nada; con
  //   `noUncheckedIndexedAccess` se usan guardas o `itemAt`/`firstItem` de `@sextante/core/arrays`.
  // - `eqeqeq`: siempre `===`, salvo el modismo `x == null` (null o undefined a la vez).
  {
    files: ["src/**/*.{ts,tsx}", "packages/**/*.ts"],
    rules: {
      // `import()` en anotaciones se permite: es el patrón de `vi.mock(…, importOriginal<typeof import(…)>)`.
      "@typescript-eslint/consistent-type-imports": ["error", { disallowTypeAnnotations: false }],
      "@typescript-eslint/no-non-null-assertion": "error",
      eqeqeq: ["error", "always", { null: "ignore" }],
    },
  },
  // Tamaño de componente: por encima de ~300 líneas efectivas conviene extraer un
  // hook o un subcomponente.
  {
    files: ["src/**/*.tsx"],
    ignores: ["**/*.test.tsx"],
    rules: {
      "max-lines": ["error", { max: 300, skipBlankLines: true, skipComments: true }],
    },
  },
  // Tamaño de módulo `.ts`: por encima de ~400 líneas efectivas un módulo suele mezclar
  // responsabilidades (el mayor de lógica, `fiscal/realised-gains.ts`, ronda las 260). Fuera quedan
  // los tests (un `describe` largo no es un problema de diseño), las tablas de datos y el registro
  // declarativo de esquemas de calculadoras, que crecen con el producto y no con la lógica.
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
