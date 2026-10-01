// Guardarraíl del catálogo: `registry.ts` alimenta el selector Y el sitemap, así
// que una entrada sin página produce un 404 indexado, y una sin mensajes o sin
// explainer produce una página rota o a medias. Este test comprueba que cada
// calculadora publicada tiene sus cuatro piezas, y que no queda material
// huérfano de una calculadora retirada.
//
// REGLA REAL: los checks se aplican a las calculadoras con `status: "live"`. Las
// de `status: "soon"` aparecen en el selector como «próximamente» y por
// definición todavía no tienen ni página ni mensajes ni explainer. Hoy las 26
// entradas son "live" y las 26 tienen las cuatro piezas.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FIRE_CALCULATOR_SLUG } from "@sextante/core/portfolio-goal";
import { describe, expect, it } from "vitest";

import { CALCULATORS } from "./registry";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PAGES_DIR = path.join(ROOT, "src", "app", "[locale]", "calculadoras");
const EXPLAINERS_DIR = path.join(ROOT, "content", "wiki", "explainers");
const LOCALES = ["es", "en"] as const;

type Locale = (typeof LOCALES)[number];
type MessageTree = { readonly [key: string]: string | MessageTree };

function loadCalcNamespaces(locale: Locale): ReadonlySet<string> {
  const file = path.join(ROOT, "messages", `${locale}.json`);
  const messages = JSON.parse(readFileSync(file, "utf8")) as { calc?: MessageTree };
  return new Set(Object.keys(messages.calc ?? {}));
}

const calcNamespaces = new Map<Locale, ReadonlySet<string>>(
  LOCALES.map((locale) => [locale, loadCalcNamespaces(locale)]),
);

const liveSlugs = CALCULATORS.filter((c) => c.status === "live").map((c) => c.slug);
const allSlugs = new Set(CALCULATORS.map((c) => c.slug));

const pageDirs = readdirSync(PAGES_DIR).filter((entry) => statSync(path.join(PAGES_DIR, entry)).isDirectory());

describe("registry: coherencia del catálogo", () => {
  it("no hay slugs duplicados", () => {
    expect(allSlugs.size).toBe(CALCULATORS.length);
  });

  it("cada calculadora publicada tiene su página", () => {
    const missing = liveSlugs.filter((slug) => !existsSync(path.join(PAGES_DIR, slug, "page.tsx")));
    expect(missing).toEqual([]);
  });

  it.each(LOCALES)("cada calculadora publicada tiene su namespace calc.<slug> en %s", (locale) => {
    const namespaces = calcNamespaces.get(locale)!;
    const missing = liveSlugs.filter((slug) => !namespaces.has(slug));
    expect(missing).toEqual([]);
  });

  it.each(LOCALES)("cada calculadora publicada tiene su explainer en %s", (locale) => {
    const missing = liveSlugs.filter((slug) => !existsSync(path.join(EXPLAINERS_DIR, `${slug}.${locale}.md`)));
    expect(missing).toEqual([]);
  });
});

describe("registry: sin material huérfano", () => {
  it("no hay páginas de calculadora fuera del registry", () => {
    expect(pageDirs.filter((dir) => !allSlugs.has(dir))).toEqual([]);
  });

  it.each(LOCALES)("no hay namespaces calc.* fuera del registry en %s", (locale) => {
    const orphans = [...calcNamespaces.get(locale)!].filter((ns) => !allSlugs.has(ns));
    expect(orphans).toEqual([]);
  });

  it("no hay explainers de calculadora fuera del registry", () => {
    const orphans = readdirSync(EXPLAINERS_DIR)
      .map((file) => file.replace(/\.(es|en)\.md$/, ""))
      .filter((slug) => !allSlugs.has(slug));
    expect([...new Set(orphans)]).toEqual([]);
  });
});

describe("objetivo de la cartera", () => {
  it("el slug de la calculadora FIRE existe en el registro", () => {
    // Si alguien renombra la calculadora, los escenarios guardados dejarían de encontrarse:
    // este test lo convierte en un fallo ruidoso en vez de un bloque vacío en producción.
    expect(CALCULATORS.some((c) => c.slug === FIRE_CALCULATOR_SLUG)).toBe(true);
  });
});
