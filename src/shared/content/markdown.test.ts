import { describe, expect, it, vi } from "vitest";

import { renderMarkdown } from "./markdown";

// `server-only` throws outside a React server; in the test it is enough to stub it out.
vi.mock("server-only", () => ({}));

describe("renderMarkdown", () => {
  it("drops the href of a javascript: link and keeps its text", async () => {
    const html = await renderMarkdown("[pulsa](javascript:alert(document.cookie))", "es");

    expect(html).not.toContain("javascript:");
    expect(html).toContain("<a>pulsa</a>");
  });

  it("prefixes internal links with the locale and leaves external ones alone", async () => {
    const html = await renderMarkdown("[a](/calculadoras/roi) y [b](https://www.boe.es)", "en");

    expect(html).toContain('href="/en/calculadoras/roi"');
    expect(html).toContain('href="https://www.boe.es"');
  });
});
