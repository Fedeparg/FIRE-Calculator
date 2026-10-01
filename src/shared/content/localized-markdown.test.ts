import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  listLocalizedFiles,
  listLocalizedSlugs,
  normalizeDate,
  readLocalizedMarkdown,
} from "./localized-markdown";

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "localized-md-"));
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

const write = (name: string, body: string) => fs.writeFile(path.join(dir, name), body);

describe("listLocalizedSlugs", () => {
  it("filtra por idioma, ordena y ignora ficheros ajenos y subdirectorios", async () => {
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

  it("devuelve [] si el directorio no existe o el idioma no tiene ficheros", async () => {
    expect(await listLocalizedSlugs(path.join(dir, "nope"), "es")).toEqual([]);
    expect(await listLocalizedSlugs(dir, "es")).toEqual([]);
  });

  it("acepta puntos en el slug y un patrón de slug propio", async () => {
    await write("a.b.es.md", "");
    await write("2026-09-01.es.md", "");
    await write("draft.es.md", "");
    expect(await listLocalizedSlugs(dir, "es")).toContain("a.b");
    expect(await listLocalizedSlugs(dir, "es", "\\d{4}-\\d{2}-\\d{2}")).toEqual(["2026-09-01"]);
  });
});

describe("listLocalizedFiles", () => {
  it("devuelve todos los idiomas con su nombre de fichero", async () => {
    await write("a.es.md", "");
    await write("a.en.md", "");
    const files = await listLocalizedFiles(dir);
    expect(files.map((f) => `${f.slug}:${f.locale}:${f.fileName}`).sort()).toEqual([
      "a:en:a.en.md",
      "a:es:a.es.md",
    ]);
  });
});

describe("readLocalizedMarkdown", () => {
  it("separa frontmatter y cuerpo", async () => {
    await write("a.es.md", "---\ntitle: Hola\nlevel: basico\n---\n\nCuerpo\n");
    const file = await readLocalizedMarkdown(dir, "a", "es");
    expect(file?.data).toEqual({ title: "Hola", level: "basico" });
    expect(file?.content.trim()).toBe("Cuerpo");
  });

  it("devuelve null si falta el idioma, sin caer a otro", async () => {
    await write("a.es.md", "x");
    expect(await readLocalizedMarkdown(dir, "a", "en")).toBeNull();
    expect(await readLocalizedMarkdown(dir, "zzz", "es")).toBeNull();
  });

  it("sin frontmatter da data vacío y el texto íntegro", async () => {
    await write("a.es.md", "Solo texto\n");
    const file = await readLocalizedMarkdown(dir, "a", "es");
    expect(file?.data).toEqual({});
    expect(file?.content).toBe("Solo texto\n");
  });

  it("deja pasar la fecha sin comillas como Date para que normalizeDate la procese", async () => {
    await write("a.es.md", "---\nupdated: 2026-09-03\n---\nx");
    const file = await readLocalizedMarkdown(dir, "a", "es");
    expect(normalizeDate(file?.data.updated)).toBe("2026-09-03");
  });

  it("un frontmatter YAML roto lanza en vez de publicar metadatos inventados", async () => {
    await write("a.es.md", "---\ntitle: [sin cerrar\n---\nx");
    await expect(readLocalizedMarkdown(dir, "a", "es")).rejects.toThrow();
  });
});

describe("normalizeDate", () => {
  it("acepta Date y cadenas ISO (con o sin hora) y las reduce a YYYY-MM-DD", () => {
    expect(normalizeDate(new Date("2026-09-03T00:00:00Z"))).toBe("2026-09-03");
    expect(normalizeDate("2026-09-03")).toBe("2026-09-03");
    expect(normalizeDate("2026-09-03T10:30:00Z")).toBe("2026-09-03");
  });

  it("descarta lo que no es una fecha válida", () => {
    expect(normalizeDate("no es una fecha")).toBeUndefined();
    expect(normalizeDate(new Date("x"))).toBeUndefined();
    expect(normalizeDate(20260903)).toBeUndefined();
    expect(normalizeDate(null)).toBeUndefined();
    expect(normalizeDate(undefined)).toBeUndefined();
  });
});
