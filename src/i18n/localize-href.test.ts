import { describe, expect, it } from "vitest";

import { localizeHref } from "./localize-href";

describe("localizeHref", () => {
  it("in Spanish (no prefix) changes nothing", () => {
    expect(localizeHref("/aprende/regla-del-4", "es")).toBe("/aprende/regla-del-4");
  });

  it("in English prefixes internal paths, with query and hash", () => {
    expect(localizeHref("/aprende/regla-del-4", "en")).toBe("/en/aprende/regla-del-4");
    expect(localizeHref("/calculadoras/simulador-montecarlo?model=historical", "en")).toBe(
      "/en/calculadoras/simulador-montecarlo?model=historical",
    );
    expect(localizeHref("/portfolio#objetivo", "en")).toBe("/en/portfolio#objetivo");
    expect(localizeHref("/", "en")).toBe("/en");
  });

  it("leaves external links, hashes, mailto, protocol-relative URLs and already-prefixed paths alone", () => {
    for (const href of [
      "https://aeat.es",
      "#tramos",
      "mailto:a@b.c",
      "//cdn.example/x",
      "/en/aprende",
      "/en",
      "/es/aprende",
    ]) {
      expect(localizeHref(href, "en")).toBe(href);
    }
  });

  it("does not mistake a path that starts with the locale letters", () => {
    expect(localizeHref("/entrar", "en")).toBe("/en/entrar");
  });
});
