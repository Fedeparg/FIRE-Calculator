// Catalog guardrail: `registry.ts` feeds the selector AND the sitemap, so an
// entry without a component produces an indexed 404, and one without messages or
// without an explainer produces a broken or half-finished page. This test checks
// that every calculator in the catalog has its four pieces, and that nothing is
// left orphaned by a retired calculator.

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

describe("registry: catalog consistency", () => {
  it("has no duplicate slugs", () => {
    expect(allSlugs.size).toBe(CALCULATORS.length);
  });

  it("every calculator has its component in the single route", () => {
    const missing = [...allSlugs].filter((slug) => !(slug in CALCULATOR_COMPONENTS));
    expect(missing).toEqual([]);
  });

  it.each(LOCALES)("every published calculator has its calc.<slug> namespace in %s", (locale) => {
    const namespaces = defined(calcNamespaces.get(locale));
    const missing = [...allSlugs].filter((slug) => !namespaces.has(slug));
    expect(missing).toEqual([]);
  });

  it.each(LOCALES)("every calculator has a name and description in catalog.<slug> in %s", (locale) => {
    const catalog = loadMessages(locale).catalog ?? {};
    const missing = [...allSlugs].filter((slug) => {
      const entry = catalog[slug];
      return typeof entry !== "object" || !entry.name || !entry.description;
    });
    expect(missing).toEqual([]);
    expect(Object.keys(catalog).filter((slug) => !allSlugs.has(slug))).toEqual([]);
  });

  it.each(LOCALES)("every published calculator has its explainer in %s", (locale) => {
    const missing = [...allSlugs].filter((slug) => !existsSync(path.join(EXPLAINERS_DIR, `${slug}.${locale}.md`)));
    expect(missing).toEqual([]);
  });
});

describe("registry: no orphaned material", () => {
  it("has no calculator components outside the registry", () => {
    expect(Object.keys(CALCULATOR_COMPONENTS).filter((slug) => !allSlugs.has(slug))).toEqual([]);
  });

  it.each(LOCALES)("has no calc.* namespaces outside the registry in %s", (locale) => {
    const orphans = [...defined(calcNamespaces.get(locale))].filter((ns) => !allSlugs.has(ns));
    expect(orphans).toEqual([]);
  });

  it("has no calculator explainers outside the registry", () => {
    const orphans = readdirSync(EXPLAINERS_DIR)
      .map((file) => file.replace(/\.(es|en)\.md$/, ""))
      .filter((slug) => !allSlugs.has(slug));
    expect([...new Set(orphans)]).toEqual([]);
  });
});

describe("portfolio goal", () => {
  it("the FIRE calculator slug exists in the registry", () => {
    // If someone renames the calculator, saved scenarios would no longer be found: this test
    // turns that into a loud failure instead of an empty block in production.
    expect(CALCULATORS.some((c) => c.slug === FIRE_CALCULATOR_SLUG)).toBe(true);
  });
});
