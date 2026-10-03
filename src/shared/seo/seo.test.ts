import { firstItem } from "@sextante/core/arrays";
import { describe, expect, it } from "vitest";

import { buildMetadata, localizedPath, ogImagePath, privateMetadata } from "./seo";

describe("localizedPath", () => {
  it("deja el castellano sin prefijo y prefija el inglés con /en", () => {
    expect(localizedPath("es", "/aprende")).toBe("/aprende");
    expect(localizedPath("en", "/aprende")).toBe("/en/aprende");
  });

  it("trata la home sin barra doble", () => {
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

  it("emite canonical, hreflang con x-default al castellano y Open Graph del idioma", () => {
    const meta = buildMetadata(base);
    expect(meta.alternates).toEqual({
      canonical: "/en/aprende/fire",
      languages: { es: "/aprende/fire", en: "/en/aprende/fire", "x-default": "/aprende/fire" },
    });
    expect(meta.openGraph).toMatchObject({ type: "website", url: "/en/aprende/fire", locale: "en_US" });
    expect(meta.title).toBe("FIRE");
  });

  it("cae a castellano con un idioma inválido", () => {
    const meta = buildMetadata({ ...base, locale: "fr" });
    expect(meta.alternates?.canonical).toBe("/aprende/fire");
    expect(meta.openGraph).toMatchObject({ locale: "es_ES" });
  });

  it("la imagen OG identifica la tarjeta por slug y nunca lleva el título en claro", () => {
    const url = firstItem(buildMetadata(base).twitter?.images as string[]);
    const params = new URL(url, "http://x").searchParams;
    expect(params.get("article")).toBe("fire");
    expect(params.get("locale")).toBe("en");
    expect(params.has("title")).toBe(false);
  });

  it("cada tipo de tarjeta usa su parámetro", () => {
    expect(ogImagePath({ kind: "page", page: "home" }, "es")).toBe("/og?page=home&locale=es");
    expect(ogImagePath({ kind: "calculator", slug: "roi" }, "en")).toBe("/og?calc=roi&locale=en");
    expect(ogImagePath({ kind: "legal", slug: "privacidad" }, "es")).toBe("/og?legal=privacidad&locale=es");
  });

  it("titleAbsolute evita la plantilla de marca", () => {
    expect(buildMetadata({ ...base, titleAbsolute: true }).title).toEqual({ absolute: "FIRE" });
  });

  it("noindex añade robots y su ausencia no deja la clave", () => {
    expect(buildMetadata({ ...base, noindex: true }).robots).toEqual({ index: false, follow: true });
    expect("robots" in buildMetadata(base)).toBe(false);
  });

  it("respeta ogType article", () => {
    expect(buildMetadata({ ...base, ogType: "article" }).openGraph).toMatchObject({ type: "article" });
  });
});

describe("privateMetadata", () => {
  it("pone el título y prohíbe indexar y seguir enlaces", () => {
    expect(privateMetadata("Mi cuenta")).toEqual({ title: "Mi cuenta", robots: { index: false, follow: false } });
  });
});
