import { describe, expect, it } from "vitest";

import { isSafeHref } from "./safe-href";

describe("isSafeHref", () => {
  it("accepts web and email links, relative paths and anchors", () => {
    for (const href of [
      "https://www.boe.es/buscar/act.php?id=BOE-A-2006-20764",
      "http://example.com",
      "mailto:hola@example.com",
      "/calculadoras/hipoteca-fija",
      "../aprende",
      "otra-pagina",
      "#seccion",
      "?q=1",
    ]) {
      expect(isSafeHref(href), href).toBe(true);
    }
  });

  it("rejects javascript:, data: and vbscript:, including disguised ones", () => {
    for (const href of [
      "javascript:alert(1)",
      "JaVaScRiPt:alert(1)",
      " javascript:alert(1)",
      "\u0001javascript:alert(1)",
      "java\tscript:alert(1)",
      "java\nscript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
    ]) {
      expect(isSafeHref(href), JSON.stringify(href)).toBe(false);
    }
  });
});
