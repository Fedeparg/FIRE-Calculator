// Tests del changelog. Dos frentes independientes: la VALIDACIÓN (el JSON viene de
// un script y puede estar a medias o mal editado a mano: lo malo se descarta, la
// página no se rompe) y el FILTRADO (categoría + cambios internos, incluida la
// desaparición de las entregas que se quedan sin nada visible).

import { describe, expect, it } from "vitest";

import {
  availableCategories,
  filterReleases,
  localizeReleases,
  parseChangelog,
  summarizeReleases,
  type ChangelogEntry,
  type ChangelogRelease,
} from "./changelog";

/** Entrada bruta mínima válida, con los campos que se quieran sobreescribir. */
function rawEntry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    hash: "abc1234",
    type: "feat",
    scope: "portfolio",
    category: "feature",
    text: { es: "texto es", en: "texto en" },
    hidden: false,
    ...overrides,
  };
}

/** Entrega bruta mínima válida. */
function rawRelease(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    date: "2026-09-03",
    title: { es: "Titular", en: "Headline" },
    summary: { es: "Resumen", en: "Summary" },
    highlight: false,
    entries: [rawEntry()],
    ...overrides,
  };
}

/** Entrada ya validada, para los tests de localización y filtrado. */
function entry(overrides: Partial<ChangelogEntry> = {}): ChangelogEntry {
  return {
    hash: "abc1234",
    scope: null,
    category: "feature",
    text: { es: "texto es", en: "texto en" },
    hidden: false,
    ...overrides,
  };
}

/** Entrega ya validada. */
function release(overrides: Partial<ChangelogRelease> = {}): ChangelogRelease {
  return {
    date: "2026-09-03",
    title: { es: "Titular", en: "Headline" },
    summary: { es: "Resumen", en: "Summary" },
    highlight: false,
    entries: [entry()],
    ...overrides,
  };
}

describe("parseChangelog: validación", () => {
  it("acepta un fichero bien formado", () => {
    const parsed = parseChangelog({
      generatedFrom: "git log main",
      releases: [rawRelease()],
    });

    expect(parsed.generatedFrom).toBe("git log main");
    expect(parsed.releases).toHaveLength(1);
    expect(parsed.releases[0]).toEqual({
      date: "2026-09-03",
      title: { es: "Titular", en: "Headline" },
      summary: { es: "Resumen", en: "Summary" },
      highlight: false,
      entries: [
        {
          hash: "abc1234",
          scope: "portfolio",
          category: "feature",
          text: { es: "texto es", en: "texto en" },
          hidden: false,
        },
      ],
    });
  });

  it.each([null, undefined, 42, "texto", [], { releases: "no es un array" }])(
    "devuelve un changelog vacío ante una raíz inservible (%p)",
    (raw) => {
      expect(parseChangelog(raw)).toEqual({ generatedFrom: "", releases: [] });
    },
  );

  it("ordena las entregas por fecha descendente", () => {
    const parsed = parseChangelog({
      releases: [
        rawRelease({ date: "2026-06-27" }),
        rawRelease({ date: "2026-09-03" }),
        rawRelease({ date: "2026-07-15" }),
      ],
    });

    expect(parsed.releases.map((r) => r.date)).toEqual(["2026-09-03", "2026-07-15", "2026-06-27"]);
  });

  it("descarta entregas sin fecha utilizable", () => {
    const parsed = parseChangelog({
      releases: [
        rawRelease({ date: "03/09/2026" }),
        rawRelease({ date: "2026-02-31" }), // día inexistente
        rawRelease({ date: 20260903 }),
        rawRelease({ date: null }),
        rawRelease({ date: "2026-09-03" }),
      ],
    });

    expect(parsed.releases.map((r) => r.date)).toEqual(["2026-09-03"]);
  });

  it("descarta cambios sin hash o con categoría desconocida, y conserva el resto", () => {
    const parsed = parseChangelog({
      releases: [
        rawRelease({
          entries: [
            rawEntry({ hash: "" }),
            rawEntry({ hash: null }),
            rawEntry({ category: "refactor" }),
            rawEntry({ category: undefined }),
            "no es un objeto",
            rawEntry({ hash: "bueno01" }),
          ],
        }),
      ],
    });

    expect(parsed.releases[0].entries.map((e) => e.hash)).toEqual(["bueno01"]);
  });

  it("normaliza campos flojos sin descartar el cambio", () => {
    const parsed = parseChangelog({
      releases: [
        rawRelease({
          highlight: "sí",
          title: "no es un objeto",
          summary: undefined,
          entries: [rawEntry({ scope: null, hidden: "sí", text: { es: "  hola  " } })],
        }),
      ],
    });

    const [first] = parsed.releases;
    expect(first.highlight).toBe(false);
    expect(first.title).toEqual({ es: "", en: "" });
    expect(first.summary).toEqual({ es: "", en: "" });
    expect(first.entries[0].scope).toBeNull();
    expect(first.entries[0].hidden).toBe(false);
    expect(first.entries[0].text).toEqual({ es: "hola", en: "" });
  });

  it("descarta una entrega que se queda sin cambios y sin ningún texto", () => {
    const parsed = parseChangelog({
      releases: [
        rawRelease({
          entries: [rawEntry({ category: "desconocida" })],
          title: { es: "", en: "" },
          summary: { es: "", en: "" },
        }),
      ],
    });

    expect(parsed.releases).toEqual([]);
  });

  it("conserva una entrega sin cambios si conserva titular (hito redactado a mano)", () => {
    const parsed = parseChangelog({
      releases: [rawRelease({ entries: [], title: { es: "Lanzamiento", en: "" } })],
    });

    expect(parsed.releases).toHaveLength(1);
    expect(parsed.releases[0].entries).toEqual([]);
  });

  it("valida el fichero real del repositorio sin descartar nada", async () => {
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const { fileURLToPath } = await import("node:url");

    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
    const file = path.join(root, "content", "changelog", "releases.json");
    const raw: unknown = JSON.parse(readFileSync(file, "utf8"));

    const parsed = parseChangelog(raw);
    const rawReleases = (raw as { releases: unknown[] }).releases;

    expect(parsed.releases.length).toBe(rawReleases.length);
    // Las fechas deben quedar en orden estrictamente descendente.
    const dates = parsed.releases.map((r) => r.date);
    expect([...dates].sort((a, b) => b.localeCompare(a))).toEqual(dates);
  });
});

describe("localizeReleases: elección de idioma y degradación", () => {
  it("usa el idioma pedido cuando está disponible", () => {
    const [localized] = localizeReleases([release()], "en");

    expect(localized.title).toBe("Headline");
    expect(localized.summary).toBe("Summary");
    expect(localized.entries[0].text).toBe("texto en");
  });

  it("cae al otro idioma cuando el pedido está vacío", () => {
    const [localized] = localizeReleases(
      [
        release({
          title: { es: "Titular", en: "" },
          summary: { es: "", en: "" },
          entries: [entry({ text: { es: "solo en castellano", en: "" } })],
        }),
      ],
      "en",
    );

    expect(localized.title).toBe("Titular");
    expect(localized.summary).toBeNull();
    expect(localized.entries[0].text).toBe("solo en castellano");
  });

  it("deja título y resumen a null cuando no hay texto en ningún idioma", () => {
    const [localized] = localizeReleases([release({ title: { es: "", en: "" }, summary: { es: "", en: "" } })], "es");

    expect(localized.title).toBeNull();
    expect(localized.summary).toBeNull();
    // La entrega sigue ahí: tiene cambios que contar, y la interfaz cae a la fecha.
    expect(localized.entries).toHaveLength(1);
  });

  it("descarta los cambios sin texto en ningún idioma", () => {
    const [localized] = localizeReleases(
      [
        release({
          entries: [entry({ hash: "vacio", text: { es: "", en: "" } }), entry({ hash: "lleno" })],
        }),
      ],
      "es",
    );

    expect(localized.entries.map((e) => e.hash)).toEqual(["lleno"]);
  });

  it("descarta la entrega que se queda sin cambios legibles ni titular", () => {
    const localized = localizeReleases(
      [
        release({
          title: { es: "", en: "" },
          summary: { es: "", en: "" },
          entries: [entry({ text: { es: "", en: "" } })],
        }),
      ],
      "es",
    );

    expect(localized).toEqual([]);
  });

  it("marca como interno tanto lo oculto como la categoría internal", () => {
    const [localized] = localizeReleases(
      [
        release({
          entries: [
            entry({ hash: "a", category: "feature", hidden: false }),
            entry({ hash: "b", category: "internal", hidden: false }),
            entry({ hash: "c", category: "fix", hidden: true }),
          ],
        }),
      ],
      "es",
    );

    expect(localized.entries.map((e) => [e.hash, e.internal])).toEqual([
      ["a", false],
      ["b", true],
      ["c", true],
    ]);
  });
});

describe("filterReleases: categoría e internos", () => {
  const localized = localizeReleases(
    [
      release({
        date: "2026-09-03",
        entries: [
          entry({ hash: "f1", category: "feature" }),
          entry({ hash: "i1", category: "internal" }),
          entry({ hash: "h1", category: "fix", hidden: true }),
        ],
      }),
      release({
        date: "2026-08-01",
        title: { es: "Otra", en: "Other" },
        entries: [entry({ hash: "s1", category: "security" })],
      }),
      release({
        date: "2026-07-01",
        title: { es: "Solo fontanería", en: "Plumbing only" },
        entries: [entry({ hash: "i2", category: "internal" })],
      }),
    ],
    "es",
  );

  it("por defecto esconde los cambios internos y los ocultos", () => {
    const filtered = filterReleases(localized, { category: "all", includeInternal: false });

    expect(filtered.flatMap((r) => r.entries.map((e) => e.hash))).toEqual(["f1", "s1"]);
  });

  it("elimina de la línea temporal la entrega que se queda sin cambios visibles", () => {
    const filtered = filterReleases(localized, { category: "all", includeInternal: false });

    // La entrega del 2026-07-01 solo tenía fontanería: desaparece entera.
    expect(filtered.map((r) => r.date)).toEqual(["2026-09-03", "2026-08-01"]);
  });

  it("muestra los internos cuando se piden", () => {
    const filtered = filterReleases(localized, { category: "all", includeInternal: true });

    expect(filtered.flatMap((r) => r.entries.map((e) => e.hash))).toEqual(["f1", "i1", "h1", "s1", "i2"]);
  });

  it("filtra por categoría", () => {
    const filtered = filterReleases(localized, { category: "security", includeInternal: false });

    expect(filtered).toHaveLength(1);
    expect(filtered[0].entries.map((e) => e.hash)).toEqual(["s1"]);
  });

  it("combina categoría e internos: un fix oculto solo aparece con el interruptor", () => {
    const sinInternos = filterReleases(localized, { category: "fix", includeInternal: false });
    const conInternos = filterReleases(localized, { category: "fix", includeInternal: true });

    expect(sinInternos).toEqual([]);
    expect(conInternos.flatMap((r) => r.entries.map((e) => e.hash))).toEqual(["h1"]);
  });

  it("no muta las entregas de entrada", () => {
    const before = JSON.stringify(localized);
    filterReleases(localized, { category: "feature", includeInternal: true });
    expect(JSON.stringify(localized)).toBe(before);
  });

  it("con una lista vacía devuelve una lista vacía", () => {
    expect(filterReleases([], { category: "all", includeInternal: true })).toEqual([]);
  });
});

describe("availableCategories", () => {
  it("devuelve solo las presentes, en el orden canónico", () => {
    const localized = localizeReleases(
      [
        release({
          entries: [
            entry({ hash: "a", category: "internal" }),
            entry({ hash: "b", category: "security" }),
            entry({ hash: "c", category: "feature" }),
            entry({ hash: "d", category: "feature" }),
          ],
        }),
      ],
      "es",
    );

    expect(availableCategories(localized)).toEqual(["feature", "security", "internal"]);
  });

  it("con una lista vacía no ofrece ninguna", () => {
    expect(availableCategories([])).toEqual([]);
  });
});

describe("summarizeReleases", () => {
  it("cuenta entregas, cambios y el rango de fechas", () => {
    const localized = localizeReleases(
      [
        release({ date: "2026-09-03", entries: [entry({ hash: "a" }), entry({ hash: "b" })] }),
        release({ date: "2026-06-27", entries: [entry({ hash: "c" })] }),
      ],
      "es",
    );

    expect(summarizeReleases(localized)).toEqual({
      releaseCount: 2,
      changeCount: 3,
      firstDate: "2026-06-27",
      lastDate: "2026-09-03",
    });
  });

  it("con una lista vacía devuelve ceros y fechas nulas", () => {
    expect(summarizeReleases([])).toEqual({
      releaseCount: 0,
      changeCount: 0,
      firstDate: null,
      lastDate: null,
    });
  });

  it("una sola entrega tiene la misma fecha de inicio y de fin", () => {
    const localized = localizeReleases([release({ date: "2026-07-15" })], "es");

    expect(summarizeReleases(localized)).toMatchObject({
      releaseCount: 1,
      firstDate: "2026-07-15",
      lastDate: "2026-07-15",
    });
  });
});
