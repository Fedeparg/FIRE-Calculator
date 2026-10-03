import { describe, expect, it, vi } from "vitest";

import { renderMarkdown } from "./markdown";

// `server-only` lanza fuera de un servidor de React; en el test basta con neutralizarlo.
vi.mock("server-only", () => ({}));

describe("renderMarkdown", () => {
  it("quita el href de un enlace javascript: y conserva su texto", async () => {
    const html = await renderMarkdown("[pulsa](javascript:alert(document.cookie))", "es");

    expect(html).not.toContain("javascript:");
    expect(html).toContain("<a>pulsa</a>");
  });

  it("prefija con el idioma los enlaces internos y deja los externos", async () => {
    const html = await renderMarkdown("[a](/calculadoras/roi) y [b](https://www.boe.es)", "en");

    expect(html).toContain('href="/en/calculadoras/roi"');
    expect(html).toContain('href="https://www.boe.es"');
  });
});
