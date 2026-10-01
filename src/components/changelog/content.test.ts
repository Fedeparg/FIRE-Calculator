// Guardarraíl de las Novedades: cada entrega debe existir en los dos idiomas con título. Sin
// esto, `/en/novedades` pierde una entrega en silencio (o enseña una sin titular). Mismo
// espíritu que `i18n-parity.test.ts`.

import { describe, expect, it, vi } from "vitest";

// `server-only` lanza fuera de un servidor de React; en el test basta con neutralizarlo.
vi.mock("server-only", () => ({}));

const { getChangelog, getChangelogDates, getChangelogLastUpdated } = await import("./content");

describe("novedades", () => {
  it("tiene las mismas fechas en castellano e inglés", async () => {
    const es = await getChangelogDates("es");
    const en = await getChangelogDates("en");
    expect(es.length).toBeGreaterThan(0);
    expect(en).toEqual(es);
  });

  it.each(["es", "en"])("cada entrega en %s tiene título y cuerpo", async (locale) => {
    for (const release of await getChangelog(locale)) {
      expect(release.title.trim(), release.date).not.toBe("");
      expect(release.html.trim(), release.date).not.toBe("");
    }
  });

  it("ordena de más reciente a más antigua y expone la última fecha", async () => {
    const dates = (await getChangelog("es")).map((release) => release.date);
    expect(dates).toEqual([...dates].sort().reverse());
    expect(await getChangelogLastUpdated()).toBe(dates[0]);
  });
});
