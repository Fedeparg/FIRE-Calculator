// Red de seguridad de los mensajes por ruta (ver `route-namespaces.ts`): si un componente de
// cliente llama a `useTranslations("ns")` y su ruta no envía `ns` al provider, en runtime falta
// el mensaje (next-intl pinta la ruta de la clave y registra un error). Este test lo detecta
// antes, sin renderizar nada.
//
// Método (análisis textual del grafo de imports, como `i18n-orphans.test.ts`):
//  1. Desde cada `page.tsx`/`layout.tsx` de `src/app/[locale]` se siguen los imports (estáticos,
//     `import()` literal y re-exports). Un fichero con `"use client"` y todo lo que importa
//     corre en el cliente; ahí se recogen los `useTranslations("ns")`. Los de servidor leen del
//     request config y no dependen del provider.
//  2. Cada ruta se compara con lo que declara `ROUTE_NAMESPACES` (o `CHROME_NAMESPACES` si no
//     monta `RouteMessages`). Un namespace declarado cubre sus descendientes (`auth` cubriría
//     `auth.nav`), no al revés.
//  3. `calculadoras/[slug]` sirve 27 componentes desde `CalculatorBody`: se comprueba cada uno
//     por separado contra `calc.<slug>`.
//
// Límites: solo ve argumentos literales. `useTranslations()` sin namespace, variables o plantillas
// distintas de `calc.${namespace}` hacen fallar el test a propósito (no se pueden verificar); un
// `t` pasado por props queda cubierto por el namespace de quien lo creó. Tampoco ve las claves
// concretas (`t("x")`) dentro del namespace: eso lo cubre la paridad es/en y la verificación en
// navegador.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CALCULATORS } from "@/features/calculators/registry";
import { loadMessages, LOCALES, ROOT } from "./messages-fixtures";
import { pickMessages } from "./pick-messages";
import { CHROME_NAMESPACES, ROUTE_NAMESPACES, type RouteKey } from "./route-namespaces";
import { defined } from "@sextante/core/assert";

const SRC = path.join(ROOT, "src");
const APP = path.join(SRC, "app", "[locale]");
const CALCULATOR_BODY = path.join(SRC, "features", "calculators", "components", "CalculatorBody.tsx");
const CALC_TEMPLATE = "calc.*";
/**
 * `calc.${calculatorSlug}`: el namespace de la calculadora EN CURSO, que `NumField` lee del
 * contexto (`useCalculatorSlug`, el slug de la ruta). Por construcción es siempre el `calc.<slug>`
 * de la página que lo monta, así que está cubierto.
 */
const CALC_OWN = "calc.<own>";

function listSources(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return listSources(full);
    return /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [full] : [];
  });
}

type SourceInfo = { client: boolean; imports: string[]; namespaces: string[]; unsupported: string[] };
const modules = new Map<string, SourceInfo>();

function resolveImport(from: string, specifier: string): string | null {
  let base: string;
  if (specifier.startsWith("@/")) base = path.join(SRC, specifier.slice(2));
  else if (specifier.startsWith(".")) base = path.resolve(path.dirname(from), specifier);
  else return null; // paquetes (react, next-intl, @sextante/core…): sin componentes de la app
  const candidates = [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")];
  return candidates.find((c) => existsSync(c) && statSync(c).isFile()) ?? null;
}

function parse(file: string): SourceInfo {
  const cached = modules.get(file);
  if (cached) return cached;
  const source = readFileSync(file, "utf8");
  const imports = [...source.matchAll(/(?:from\s+|import\s*\(\s*|import\s+)["']([^"']+)["']/g)]
    .map((m) => resolveImport(file, defined(m[1])))
    .filter((f): f is string => f !== null);
  const namespaces: string[] = [];
  const unsupported: string[] = [];
  for (const [, arg = ""] of source.matchAll(/useTranslations\(([^)]*)\)/g)) {
    const literal = /^\s*["']([\w.-]+)["']\s*$/.exec(arg);
    if (literal) namespaces.push(defined(literal[1]));
    else if (/^\s*`calc\.\$\{calculatorSlug\}`\s*$/.test(arg)) namespaces.push(CALC_OWN);
    else if (/^\s*`calc\.\$\{\w+\}`\s*$/.test(arg)) namespaces.push(CALC_TEMPLATE);
    else unsupported.push(`useTranslations(${arg.trim()})`);
  }
  const info: SourceInfo = { client: /^\s*["']use client["']/.test(source), imports, namespaces, unsupported };
  modules.set(file, info);
  return info;
}

/** Namespaces (y usos no verificables) de los componentes de cliente alcanzables desde `entry`. */
function clientUsage(entry: string, startsOnClient: boolean) {
  const used = new Map<string, string>(); // namespace -> primer fichero que lo usa
  const unsupported: string[] = [];
  const seen = new Set<string>();
  const visit = (file: string, onClient: boolean): void => {
    const key = `${file}|${onClient}`;
    if (seen.has(key)) return;
    seen.add(key);
    const info = parse(file);
    const client = onClient || info.client;
    if (client) {
      for (const ns of info.namespaces) if (!used.has(ns)) used.set(ns, path.relative(SRC, file));
      unsupported.push(...info.unsupported.map((u) => `${path.relative(SRC, file)}: ${u}`));
    }
    // `CalculatorBody` enlaza las 27 calculadoras: se verifican una a una más abajo.
    if (file === CALCULATOR_BODY) return;
    for (const imported of info.imports) visit(imported, client);
  };
  visit(entry, startsOnClient);
  return { used, unsupported };
}

const covers = (declared: readonly string[], ns: string): boolean =>
  declared.some((d) => ns === d || ns.startsWith(`${d}.`));

const routeKeys = Object.keys(ROUTE_NAMESPACES) as RouteKey[];

/** Clave de `ROUTE_NAMESPACES` que gobierna una carpeta (la más específica) o null. */
function routeOf(dir: string): RouteKey | null {
  const matches = routeKeys.filter((key) => dir === key || dir.startsWith(`${key}/`));
  return matches.sort((a, b) => b.length - a.length)[0] ?? null;
}

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const routeFiles = listSources(APP).filter((f) => /\/(page|layout)\.tsx$/.test(f));

describe("mensajes por ruta", () => {
  it.each(routeFiles.map((f) => [path.relative(APP, f), f] as const))(
    "%s: los namespaces de sus componentes de cliente llegan al provider",
    (relative, file) => {
      const route = routeOf(path.dirname(relative).replace(/^\.$/, ""));
      const declared: readonly string[] = route ? ROUTE_NAMESPACES[route] : CHROME_NAMESPACES;
      const { used, unsupported } = clientUsage(file, false);
      used.delete(CALC_TEMPLATE); // el cuerpo de la calculadora se comprueba por slug
      used.delete(CALC_OWN);

      expect(unsupported).toEqual([]);
      const missing = [...used].filter(([ns]) => !covers(declared, ns)).map(([ns, from]) => `${ns} (${from})`);
      expect(missing, `Faltan en ${route ? `ROUTE_NAMESPACES["${route}"]` : "CHROME_NAMESPACES"}`).toEqual([]);
    },
  );

  it("cada ruta declarada monta su RouteMessages, y solo ahí", () => {
    for (const key of routeKeys) {
      // Tiene que envolver TODO lo que devuelve la ruta: un componente de cliente fuera del
      // provider (p. ej. el `CalculatorActions` del shell) vería los mensajes del layout raíz.
      const outermost = new RegExp(`return\\s*\\(?\\s*<RouteMessages route="${escapeRegExp(key)}"`);
      const owners = ["page.tsx", "layout.tsx"]
        .map((name) => path.join(APP, key, name))
        .filter((f) => existsSync(f) && outermost.test(readFileSync(f, "utf8")));
      expect(owners, `${key} debe devolver <RouteMessages route="${key}"> como elemento más externo`).toHaveLength(1);
    }
    for (const file of routeFiles) {
      for (const [, route] of readFileSync(file, "utf8").matchAll(/<RouteMessages route="([^"]+)"/g)) {
        expect(path.dirname(path.relative(APP, file)), `${route} montado en otra carpeta`).toBe(route);
      }
    }
  });

  describe("calculadoras/[slug]", () => {
    const body = readFileSync(CALCULATOR_BODY, "utf8");
    const components = new Map(
      [...body.matchAll(/^\s*"?([\w-]+)"?:\s*dynamic\(\(\)\s*=>\s*import\("([^"]+)"\)\)/gm)].map(
        (m) => [defined(m[1]), defined(resolveImport(CALCULATOR_BODY, defined(m[2])))] as const,
      ),
    );

    it("CalculatorBody cubre exactamente las calculadoras del registry", () => {
      expect([...components.keys()].sort()).toEqual(CALCULATORS.map((c) => c.slug).sort());
    });

    it.each([...components])("%s: solo usa su calc.<slug> y los namespaces comunes", (slug, file) => {
      const declared = [...ROUTE_NAMESPACES["calculadoras/[slug]"], `calc.${slug}`];
      const { used, unsupported } = clientUsage(file, true);
      used.delete(CALC_OWN);
      // `DepositLikeCalculator` recibe su namespace por props: el envoltorio del slug debe pasar el suyo.
      if (used.delete(CALC_TEMPLATE)) expect(readFileSync(file, "utf8")).toContain(`namespace="${slug}"`);

      expect(unsupported).toEqual([]);
      const missing = [...used].filter(([ns]) => !covers(declared, ns)).map(([ns, from]) => `${ns} (${from})`);
      expect(missing).toEqual([]);
    });
  });

  it("los namespaces declarados existen en es y en", () => {
    const declared = [...CHROME_NAMESPACES, ...Object.values(ROUTE_NAMESPACES).flat()];
    for (const locale of LOCALES) {
      expect(() => pickMessages(loadMessages(locale), declared)).not.toThrow();
    }
  });
});
