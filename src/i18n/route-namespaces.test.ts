// Safety net for per-route messages (see `route-namespaces.ts`): if a client component calls
// `useTranslations("ns")` and its route does not send `ns` to the provider, the message is
// missing at runtime (next-intl renders the key path and logs an error). This test catches it
// earlier, without rendering anything.
//
// Method (textual analysis of the import graph, like `i18n-orphans.test.ts`):
//  1. From every `page.tsx`/`layout.tsx` in `src/app/[locale]`, imports are followed (static,
//     literal `import()` and re-exports). A file with `"use client"` and everything it imports
//     runs on the client; that is where `useTranslations("ns")` calls are collected. Server
//     components read from the request config and do not depend on the provider.
//  2. Each route is compared with what `ROUTE_NAMESPACES` declares (or `CHROME_NAMESPACES` if it
//     does not mount `RouteMessages`). A declared namespace covers its descendants (`auth` would
//     cover `auth.nav`), not the other way round.
//  3. `calculadoras/[slug]` serves 27 components from `CalculatorBody`: each one is checked
//     separately against `calc.<slug>`.
//
// Limits: it only sees literal arguments. `useTranslations()` without a namespace, variables or
// templates other than `calc.${namespace}` make the test fail on purpose (they cannot be
// verified); a `t` passed via props is covered by the namespace of whoever created it. Nor does it
// see the concrete keys (`t("x")`) inside a namespace: es/en parity and in-browser checks cover
// that.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { defined } from "@sextante/core/assert";
import { CALCULATORS } from "@/features/calculators/registry";
import { loadMessages, LOCALES, ROOT } from "./messages-fixtures";
import { pickMessages } from "./pick-messages";
import { CHROME_NAMESPACES, ROUTE_NAMESPACES, type RouteKey } from "./route-namespaces";

const SRC = path.join(ROOT, "src");
const APP = path.join(SRC, "app", "[locale]");
const CALCULATOR_BODY = path.join(SRC, "features", "calculators", "components", "CalculatorBody.tsx");
const CALC_TEMPLATE = "calc.*";
/**
 * `calc.${calculatorSlug}`: the CURRENT calculator's namespace, which `NumField` reads from
 * context (`useCalculatorSlug`, the route slug). By construction it is always the `calc.<slug>`
 * of the page that mounts it, so it is covered.
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
  else return null; // packages (react, next-intl, @sextante/core…): no app components
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

/** Namespaces (and unverifiable usages) of the client components reachable from `entry`. */
function clientUsage(entry: string, startsOnClient: boolean) {
  const used = new Map<string, string>(); // namespace -> first file that uses it
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
    // `CalculatorBody` links all 27 calculators: they are checked one by one below.
    if (file === CALCULATOR_BODY) return;
    for (const imported of info.imports) visit(imported, client);
  };
  visit(entry, startsOnClient);
  return { used, unsupported };
}

const covers = (declared: readonly string[], ns: string): boolean =>
  declared.some((d) => ns === d || ns.startsWith(`${d}.`));

const routeKeys = Object.keys(ROUTE_NAMESPACES) as RouteKey[];

/** The `ROUTE_NAMESPACES` key that governs a folder (the most specific one) or null. */
function routeOf(dir: string): RouteKey | null {
  const matches = routeKeys.filter((key) => dir === key || dir.startsWith(`${key}/`));
  return matches.sort((a, b) => b.length - a.length)[0] ?? null;
}

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const routeFiles = listSources(APP).filter((f) => /\/(page|layout)\.tsx$/.test(f));

describe("per-route messages", () => {
  it.each(routeFiles.map((f) => [path.relative(APP, f), f] as const))(
    "%s: its client components' namespaces reach the provider",
    (relative, file) => {
      const route = routeOf(path.dirname(relative).replace(/^\.$/, ""));
      const declared: readonly string[] = route ? ROUTE_NAMESPACES[route] : CHROME_NAMESPACES;
      const { used, unsupported } = clientUsage(file, false);
      used.delete(CALC_TEMPLATE); // the calculator body is checked per slug
      used.delete(CALC_OWN);

      expect(unsupported).toEqual([]);
      const missing = [...used].filter(([ns]) => !covers(declared, ns)).map(([ns, from]) => `${ns} (${from})`);
      expect(missing, `Missing from ${route ? `ROUTE_NAMESPACES["${route}"]` : "CHROME_NAMESPACES"}`).toEqual([]);
    },
  );

  it("every declared route mounts its RouteMessages, and only there", () => {
    for (const key of routeKeys) {
      // It must wrap EVERYTHING the route returns: a client component outside the provider
      // (e.g. the shell's `CalculatorActions`) would see the root layout's messages.
      const outermost = new RegExp(`return\\s*\\(?\\s*<RouteMessages route="${escapeRegExp(key)}"`);
      const owners = ["page.tsx", "layout.tsx"]
        .map((name) => path.join(APP, key, name))
        .filter((f) => existsSync(f) && outermost.test(readFileSync(f, "utf8")));
      expect(owners, `${key} must return <RouteMessages route="${key}"> as the outermost element`).toHaveLength(1);
    }
    for (const file of routeFiles) {
      for (const [, route] of readFileSync(file, "utf8").matchAll(/<RouteMessages route="([^"]+)"/g)) {
        expect(path.dirname(path.relative(APP, file)), `${route} mounted in another folder`).toBe(route);
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

    it("CalculatorBody covers exactly the registry calculators", () => {
      expect([...components.keys()].sort()).toEqual(CALCULATORS.map((c) => c.slug).sort());
    });

    it.each([...components])("%s: only uses its own calc.<slug> and the common namespaces", (slug, file) => {
      const declared = [...ROUTE_NAMESPACES["calculadoras/[slug]"], `calc.${slug}`];
      const { used, unsupported } = clientUsage(file, true);
      used.delete(CALC_OWN);
      // `DepositLikeCalculator` receives its namespace via props: the slug wrapper must pass its own.
      if (used.delete(CALC_TEMPLATE)) expect(readFileSync(file, "utf8")).toContain(`namespace="${slug}"`);

      expect(unsupported).toEqual([]);
      const missing = [...used].filter(([ns]) => !covers(declared, ns)).map(([ns, from]) => `${ns} (${from})`);
      expect(missing).toEqual([]);
    });
  });

  it("the declared namespaces exist in es and en", () => {
    const declared = [...CHROME_NAMESPACES, ...Object.values(ROUTE_NAMESPACES).flat()];
    for (const locale of LOCALES) {
      expect(() => pickMessages(loadMessages(locale), declared)).not.toThrow();
    }
  });
});
