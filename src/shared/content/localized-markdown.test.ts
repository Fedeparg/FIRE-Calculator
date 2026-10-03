import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { listLocalizedFiles, listLocalizedSlugs, normalizeDate, readLocalizedMarkdown } from "./localized-markdown";

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "localized-md-"));
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

const write = (name: string, body: string) => fs.writeFile(path.join(dir, name), body);

describe("listLocalizedSlugs", () => {
  it("filters by locale, sorts, and ignores unrelated files and subdirectories", async () => {
    await write("b.es.md", "");
    await write("a.es.md", "");
    await write("a.en.md", "");
    await write("c.fr.md", "");
    await write("notes.txt", "");
    await write("sin-idioma.md", "");
    await fs.mkdir(path.join(dir, "explainers.es.md"));
    expect(await listLocalizedSlugs(dir, "es")).toEqual(["a", "b"]);
    expect(await listLocalizedSlugs(dir, "en")).toEqual(["a"]);
  });

  it("returns [] if the directory does not exist or the locale has no files", async () => {
    expect(await listLocalizedSlugs(path.join(dir, "nope"), "es")).toEqual([]);
    expect(await listLocalizedSlugs(dir, "es")).toEqual([]);
  });

  it("ignores unsafe slugs (dots, uppercase) and accepts a custom slug pattern", async () => {
    await write("a.b.es.md", "");
    await write("Mayus.es.md", "");
    await write("2026-09-01.es.md", "");
    await write("draft.es.md", "");
    // Only safe slugs by default (the same ones `readLocalizedMarkdown` accepts).
    expect(await listLocalizedSlugs(dir, "es")).toEqual(["2026-09-01", "draft"]);
    expect(await listLocalizedSlugs(dir, "es", "\\d{4}-\\d{2}-\\d{2}")).toEqual(["2026-09-01"]);
  });
});

describe("listLocalizedFiles", () => {
  it("returns every locale with its file name", async () => {
    await write("a.es.md", "");
    await write("a.en.md", "");
    const files = await listLocalizedFiles(dir);
    expect(files.map((f) => `${f.slug}:${f.locale}:${f.fileName}`).sort()).toEqual(["a:en:a.en.md", "a:es:a.es.md"]);
  });
});

describe("readLocalizedMarkdown", () => {
  it("splits frontmatter and body", async () => {
    await write("a.es.md", "---\ntitle: Hola\nlevel: basico\n---\n\nCuerpo\n");
    const file = await readLocalizedMarkdown(dir, "a", "es");
    expect(file?.data).toEqual({ title: "Hola", level: "basico" });
    expect(file?.content.trim()).toBe("Cuerpo");
  });

  it("returns null if the locale is missing, without falling back to another", async () => {
    await write("a.es.md", "x");
    expect(await readLocalizedMarkdown(dir, "a", "en")).toBeNull();
    expect(await readLocalizedMarkdown(dir, "zzz", "es")).toBeNull();
  });

  it("never leaves the directory or reads unknown locales: an unsafe slug or locale yields null", async () => {
    const inner = path.join(dir, "inner");
    await fs.mkdir(inner);
    await write("secreto.es.md", "fuera del directorio de contenido");
    await fs.writeFile(path.join(inner, "a.es.md"), "dentro");

    expect(await readLocalizedMarkdown(inner, "../secreto", "es")).toBeNull();
    expect(await readLocalizedMarkdown(inner, "..%2Fsecreto", "es")).toBeNull();
    expect(await readLocalizedMarkdown(inner, "a", "../inner/a.es")).toBeNull();
    expect(await readLocalizedMarkdown(inner, "A", "es")).toBeNull();
    expect(await readLocalizedMarkdown(inner, "a", "fr")).toBeNull();
    expect((await readLocalizedMarkdown(inner, "a", "es"))?.content).toBe("dentro");
  });

  it("without frontmatter returns empty data and the full text", async () => {
    await write("a.es.md", "Solo texto\n");
    const file = await readLocalizedMarkdown(dir, "a", "es");
    expect(file?.data).toEqual({});
    expect(file?.content).toBe("Solo texto\n");
  });

  it("passes an unquoted date through as a Date for normalizeDate to process", async () => {
    await write("a.es.md", "---\nupdated: 2026-09-03\n---\nx");
    const file = await readLocalizedMarkdown(dir, "a", "es");
    expect(normalizeDate(file?.data.updated)).toBe("2026-09-03");
  });

  it("throws on broken YAML frontmatter instead of publishing made-up metadata", async () => {
    await write("a.es.md", "---\ntitle: [sin cerrar\n---\nx");
    await expect(readLocalizedMarkdown(dir, "a", "es")).rejects.toThrow();
  });
});

describe("normalizeDate", () => {
  it("accepts Date and ISO strings (with or without time) and reduces them to YYYY-MM-DD", () => {
    expect(normalizeDate(new Date("2026-09-03T00:00:00Z"))).toBe("2026-09-03");
    expect(normalizeDate("2026-09-03")).toBe("2026-09-03");
    expect(normalizeDate("2026-09-03T10:30:00Z")).toBe("2026-09-03");
  });

  it("discards anything that is not a valid date", () => {
    expect(normalizeDate("no es una fecha")).toBeUndefined();
    expect(normalizeDate(new Date("x"))).toBeUndefined();
    expect(normalizeDate(20260903)).toBeUndefined();
    expect(normalizeDate(null)).toBeUndefined();
    expect(normalizeDate(undefined)).toBeUndefined();
  });
});
