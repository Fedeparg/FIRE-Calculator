// Guardarraíl del catálogo: `registry.ts` alimenta el selector Y el sitemap, así
// que una entrada sin componente produce un 404 indexado, y una sin mensajes o sin
// explainer produce una página rota o a medias. Este test comprueba que cada
// calculadora del catálogo tiene sus cuatro piezas, y que no queda material
// huérfano de una calculadora retirada.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defined } from "@sextante/core/assert";
import { FIRE_CALCULATOR_SLUG } from "@sextante/core/portfolio/goal";
import { describe, expect, it } from "vitest";

import { CALCULATOR_COMPONENTS } from "./components/CalculatorBody";
import { CALCULATORS } from "./registry";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const EXPLAINERS_DIR = path.join(ROOT, "content", "wiki", "explainers");
const LOCALES = ["es", "en"] as const;

type Locale = (typeof LOCALES)[number];
type MessageTree = { readonly [key: string]: string | MessageTree };

function loadMessages(locale: Locale): { calc?: MessageTree; catalog?: MessageTree } {
  const file = path.join(ROOT, "messages", `${locale}.json`);
  return JSON.parse(readFileSync(file, "utf8")) as { calc?: MessageTree; catalog?: MessageTree };
}

function loadCalcNamespaces(locale: Locale): ReadonlySet<string> {
  return new Set(Object.keys(loadMessages(locale).calc ?? {}));
}

const calcNamespaces = new Map<Locale, ReadonlySet<string>>(
  LOCALES.map((locale) => [locale, loadCalcNamespaces(locale)]),
);

const allSlugs = new Set<string>(CALCULATORS.map((c) => c.slug));

describe("registry: coherencia del catálogo", () => {
  it("no hay slugs duplicados", () => {
    expect(allSlugs.size).toBe(CALCULATORS.length);
  });

  it("cada calculadora tiene su componente en la ruta única", () => {
    const missing = [...allSlugs].filter((slug) => !(slug in CALCULATOR_COMPONENTS));
    expect(missing).toEqual([]);
  });

  it.each(LOCALES)("cada calculadora publicada tiene su namespace calc.<slug> en %s", (locale) => {
    const namespaces = defined(calcNamespaces.get(locale));
    const missing = [...allSlugs].filter((slug) => !namespaces.has(slug));
    expect(missing).toEqual([]);
  });

  it.each(LOCALES)("cada calculadora tiene nombre y descripción en catalog.<slug> en %s", (locale) => {
    const catalog = loadMessages(locale).catalog ?? {};
    const missing = [...allSlugs].filter((slug) => {
      const entry = catalog[slug];
      return typeof entry !== "object" || !entry.name || !entry.description;
    });
    expect(missing).toEqual([]);
    expect(Object.keys(catalog).filter((slug) => !allSlugs.has(slug))).toEqual([]);
  });

  it.each(LOCALES)("cada calculadora publicada tiene su explainer en %s", (locale) => {
    const missing = [...allSlugs].filter((slug) => !existsSync(path.join(EXPLAINERS_DIR, `${slug}.${locale}.md`)));
    expect(missing).toEqual([]);
  });
});

describe("registry: sin material huérfano", () => {
  it("no hay componentes de calculadora fuera del registry", () => {
    expect(Object.keys(CALCULATOR_COMPONENTS).filter((slug) => !allSlugs.has(slug))).toEqual([]);
  });

  it.each(LOCALES)("no hay namespaces calc.* fuera del registry en %s", (locale) => {
    const orphans = [...defined(calcNamespaces.get(locale))].filter((ns) => !allSlugs.has(ns));
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
