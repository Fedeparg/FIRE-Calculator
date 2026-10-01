import { beforeEach, describe, expect, it, vi } from "vitest";

// El sitemap lee de disco vía los módulos de contenido (`server-only`); aquí se sustituyen por
// datos fijos para probar solo cómo se compone: slugs, hreflang y `lastModified` condicional.
vi.mock("@/features/wiki/content", () => ({
  getArticleSlugs: vi.fn(async (locale: string) => (locale === "es" ? ["b", "a"] : ["a", "c"])),
  getLegalSlugs: vi.fn(async () => ["privacidad"]),
  getContentUpdatedDates: vi.fn(async (kind: string) =>
    kind === "wiki" ? new Map([["a", "2026-09-03"]]) : new Map<string, string>(),
  ),
}));
vi.mock("@/features/changelog/content", () => ({
  getChangelogLastUpdated: vi.fn(async () => "2026-10-01"),
}));

import { CALCULATORS } from "@/features/calculators/registry";
import { absoluteUrl } from "@/shared/seo/site";
import sitemap from "./sitemap";

let entries: Awaited<ReturnType<typeof sitemap>>;
const byPath = (path: string) => entries.find((e) => e.url === absoluteUrl(path));

beforeEach(async () => {
  entries = await sitemap();
});

describe("sitemap", () => {
  it("lista páginas fijas, calculadoras, artículos (unión de idiomas, ordenados) y legales", () => {
    const urls = entries.map((e) => e.url);
    expect(urls).toContain(absoluteUrl("/"));
    expect(urls).toContain(absoluteUrl("/novedades"));
    for (const c of CALCULATORS) expect(urls).toContain(absoluteUrl(`/calculadoras/${c.slug}`));
    const articles = urls.filter((u) => u.includes("/aprende/"));
    expect(articles).toEqual(["a", "b", "c"].map((s) => absoluteUrl(`/aprende/${s}`)));
    expect(urls).toContain(absoluteUrl("/legal/privacidad"));
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("cada entrada declara es, en y x-default (castellano) en alternates", () => {
    const entry = byPath("/aprende/a");
    expect(entry?.alternates?.languages).toEqual({
      es: absoluteUrl("/aprende/a"),
      en: absoluteUrl("/en/aprende/a"),
      "x-default": absoluteUrl("/aprende/a"),
    });
  });

  it("emite lastModified solo cuando hay una fecha real", () => {
    expect(byPath("/aprende/a")?.lastModified).toBe("2026-09-03");
    expect(byPath("/novedades")?.lastModified).toBe("2026-10-01");
    expect(byPath("/aprende/b") && "lastModified" in byPath("/aprende/b")!).toBe(false);
    expect("lastModified" in byPath("/legal/privacidad")!).toBe(false);
    expect("lastModified" in byPath("/")!).toBe(false);
  });
});
