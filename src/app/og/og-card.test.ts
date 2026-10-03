import { describe, expect, it, vi } from "vitest";

import en from "../../../messages/en.json";
import es from "../../../messages/es.json";

// `server-only` lanza fuera de un servidor de React; el contenido de la wiki se sustituye por
// un doble para no depender del disco.
vi.mock("server-only", () => ({}));
vi.mock("@/features/wiki/content", () => ({
  getArticle: vi.fn(async (slug: string) => (slug === "regla-del-4" ? { title: "La regla del 4 %" } : null)),
  getLegalDoc: vi.fn(async (slug: string) => (slug === "privacidad" ? { title: "Privacidad" } : null)),
}));

const { resolveOgCard } = await import("./og-card");

const resolve = (query: string) => resolveOgCard(new URLSearchParams(query));

describe("resolveOgCard", () => {
  it("pinta el título de una calculadora con su categoría como subtítulo", async () => {
    await expect(resolve("calc=roi&locale=en")).resolves.toEqual({
      title: en.calc.roi.title,
      subtitle: "Investing & compound interest",
      locale: "en",
    });
  });

  it("pinta el título de las páginas fijas desde i18n", async () => {
    await expect(resolve("page=home&locale=es")).resolves.toMatchObject({ title: es.landing.meta.title });
    await expect(resolve("page=calculators&locale=en")).resolves.toMatchObject({ title: en.selector.heading });
  });

  it("pinta el título de un artículo o un texto legal existentes", async () => {
    await expect(resolve("article=regla-del-4&locale=es")).resolves.toMatchObject({ title: "La regla del 4 %" });
    await expect(resolve("legal=privacidad&locale=es")).resolves.toMatchObject({ title: "Privacidad" });
  });

  it("no acepta texto libre: slugs desconocidos o ?title= dan la tarjeta genérica", async () => {
    const generic = { title: "Sextante", subtitle: null, locale: "es" };
    await expect(resolve("title=Regala%20tu%20cartera&subtitle=Oferta")).resolves.toEqual(generic);
    await expect(resolve("calc=no-existe")).resolves.toEqual(generic);
    await expect(resolve("page=admin")).resolves.toEqual(generic);
    await expect(resolve("article=no-existe")).resolves.toEqual(generic);
  });

  it("un idioma desconocido cae al castellano", async () => {
    await expect(resolve("page=about&locale=fr")).resolves.toMatchObject({ title: es.about.meta.title, locale: "es" });
  });
});
