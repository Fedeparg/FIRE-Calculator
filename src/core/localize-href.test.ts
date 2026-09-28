import { describe, expect, it } from "vitest";

import { localizeHref } from "./localize-href";

describe("localizeHref", () => {
  it("en español (sin prefijo) no cambia nada", () => {
    expect(localizeHref("/aprende/regla-del-4", "es")).toBe("/aprende/regla-del-4");
  });

  it("en inglés prefija las rutas internas, con query y ancla", () => {
    expect(localizeHref("/aprende/regla-del-4", "en")).toBe("/en/aprende/regla-del-4");
    expect(localizeHref("/calculadoras/simulador-montecarlo?model=historical", "en")).toBe(
      "/en/calculadoras/simulador-montecarlo?model=historical",
    );
    expect(localizeHref("/portfolio#objetivo", "en")).toBe("/en/portfolio#objetivo");
    expect(localizeHref("/", "en")).toBe("/en");
  });

  it("no toca enlaces externos, anclas, mailto, rutas de red ni los ya prefijados", () => {
    for (const href of ["https://aeat.es", "#tramos", "mailto:a@b.c", "//cdn.example/x", "/en/aprende", "/en", "/es/aprende"]) {
      expect(localizeHref(href, "en")).toBe(href);
    }
  });

  it("no confunde una ruta que empieza por las letras del idioma", () => {
    expect(localizeHref("/entrar", "en")).toBe("/en/entrar");
  });
});
