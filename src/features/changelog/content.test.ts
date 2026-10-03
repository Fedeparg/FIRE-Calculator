// Guardrail for the changelog ("Novedades"): every release must exist in both locales with a
// title. Without it, `/en/novedades` silently drops a release (or shows one without a title).
// Same spirit as `i18n-parity.test.ts`.

import { describe, expect, it, vi } from "vitest";

// `server-only` throws outside a React server; in the test it is enough to stub it out.
vi.mock("server-only", () => ({}));

const { getChangelog, getChangelogDates, getChangelogLastUpdated } = await import("./content");

describe("changelog", () => {
  it("has the same dates in Spanish and English", async () => {
    const es = await getChangelogDates("es");
    const en = await getChangelogDates("en");
    expect(es.length).toBeGreaterThan(0);
    expect(en).toEqual(es);
  });

  it.each(["es", "en"])("every release in %s has a title and a body", async (locale) => {
    for (const release of await getChangelog(locale)) {
      expect(release.title.trim(), release.date).not.toBe("");
      expect(release.html.trim(), release.date).not.toBe("");
    }
  });

  it("sorts newest first and exposes the latest date", async () => {
    const dates = (await getChangelog("es")).map((release) => release.date);
    expect(dates).toEqual([...dates].sort().reverse());
    expect(await getChangelogLastUpdated()).toBe(dates[0]);
  });
});
