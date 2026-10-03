import { describe, expect, it } from "vitest";
import { firstItem } from "@sextante/core/arrays";

import { buildMetadata, localizedPath, ogImagePath, privateMetadata } from "./seo";

describe("localizedPath", () => {
  it("leaves Spanish unprefixed and prefixes English with /en", () => {
    expect(localizedPath("es", "/aprende")).toBe("/aprende");
    expect(localizedPath("en", "/aprende")).toBe("/en/aprende");
  });

  it("handles the home page without a double slash", () => {
    expect(localizedPath("es", "/")).toBe("/");
    expect(localizedPath("en", "/")).toBe("/en");
  });
});

describe("buildMetadata", () => {
  const base = {
    locale: "en",
    path: "/aprende/fire",
    title: "FIRE",
    description: "Desc",
    og: { kind: "article", slug: "fire" },
  } as const;

  it("emits canonical, hreflang with x-default to Spanish, and the locale's Open Graph", () => {
    const meta = buildMetadata(base);
    expect(meta.alternates).toEqual({
      canonical: "/en/aprende/fire",
      languages: { es: "/aprende/fire", en: "/en/aprende/fire", "x-default": "/aprende/fire" },
    });
    expect(meta.openGraph).toMatchObject({ type: "website", url: "/en/aprende/fire", locale: "en_US" });
    expect(meta.title).toBe("FIRE");
  });

  it("falls back to Spanish with an invalid locale", () => {
    const meta = buildMetadata({ ...base, locale: "fr" });
    expect(meta.alternates?.canonical).toBe("/aprende/fire");
    expect(meta.openGraph).toMatchObject({ locale: "es_ES" });
  });

  it("identifies the OG card by slug and never carries the title in plain text", () => {
    const url = firstItem(buildMetadata(base).twitter?.images as string[]);
    const params = new URL(url, "http://x").searchParams;
    expect(params.get("article")).toBe("fire");
    expect(params.get("locale")).toBe("en");
    expect(params.has("title")).toBe(false);
  });

  it("uses each card type's own parameter", () => {
    expect(ogImagePath({ kind: "page", page: "home" }, "es")).toBe("/og?page=home&locale=es");
    expect(ogImagePath({ kind: "calculator", slug: "roi" }, "en")).toBe("/og?calc=roi&locale=en");
    expect(ogImagePath({ kind: "legal", slug: "privacidad" }, "es")).toBe("/og?legal=privacidad&locale=es");
  });

  it("titleAbsolute bypasses the brand template", () => {
    expect(buildMetadata({ ...base, titleAbsolute: true }).title).toEqual({ absolute: "FIRE" });
  });

  it("noindex adds robots, and its absence leaves no key", () => {
    expect(buildMetadata({ ...base, noindex: true }).robots).toEqual({ index: false, follow: true });
    expect("robots" in buildMetadata(base)).toBe(false);
  });

  it("honors ogType article", () => {
    expect(buildMetadata({ ...base, ogType: "article" }).openGraph).toMatchObject({ type: "article" });
  });
});

describe("privateMetadata", () => {
  it("sets the title and forbids indexing and following links", () => {
    expect(privateMetadata("Mi cuenta")).toEqual({ title: "Mi cuenta", robots: { index: false, follow: false } });
  });
});
