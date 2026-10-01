import fs from "node:fs/promises";
import path from "node:path";

import matter from "gray-matter";

/**
 * Primitivas del contenido Markdown con sufijo de idioma (`<slug>.<locale>.md`) que comparten la
 * wiki, los textos legales, los explainers y las novedades. Sin `server-only` ni dependencias de
 * Next: leen del disco y se prueban contra un directorio temporal. Renderizar a HTML
 * (`renderMarkdown`) se deja a quien llama, porque los metadatos se leen a menudo sin el cuerpo.
 */

/** Slug por defecto: cualquier cosa. Las novedades lo restringen a una fecha ISO. */
const ANY_SLUG = ".+";

export interface LocalizedFile {
  slug: string;
  locale: string;
  /** Nombre del fichero dentro de su directorio. */
  fileName: string;
}

export interface ParsedMarkdown {
  /** Frontmatter YAML (vacío si no hay). */
  data: Record<string, unknown>;
  content: string;
}

/**
 * Ficheros `<slug>.<es|en>.md` de un directorio, en cualquier idioma. Un directorio que no
 * existe equivale a ninguno: el contenido es opcional y la degradación, silenciosa. Los
 * subdirectorios (p. ej. `explainers/`) se ignoran.
 */
export async function listLocalizedFiles(dir: string, slugPattern: string = ANY_SLUG): Promise<LocalizedFile[]> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const fileRe = new RegExp(`^(${slugPattern})\\.(es|en)\\.md$`);
  const files: LocalizedFile[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const match = fileRe.exec(entry.name);
    if (match) files.push({ slug: match[1], locale: match[2], fileName: entry.name });
  }
  return files;
}

/** Slugs disponibles en un idioma, ordenados alfabéticamente. */
export async function listLocalizedSlugs(
  dir: string,
  locale: string,
  slugPattern: string = ANY_SLUG,
): Promise<string[]> {
  const files = await listLocalizedFiles(dir, slugPattern);
  return files
    .filter((file) => file.locale === locale)
    .map((file) => file.slug)
    .sort();
}

/** Lee y parsea un `.md`; `null` si no se puede leer. Un frontmatter YAML roto sí lanza. */
export async function readMarkdownFile(filePath: string): Promise<ParsedMarkdown | null> {
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch {
    return null;
  }
  const { data, content } = matter(raw);
  return { data, content };
}

/** `<dir>/<slug>.<locale>.md` parseado, o `null` si no existe (sin fallback a otro idioma). */
export function readLocalizedMarkdown(dir: string, slug: string, locale: string): Promise<ParsedMarkdown | null> {
  return readMarkdownFile(path.join(dir, `${slug}.${locale}.md`));
}

/**
 * Normaliza una fecha de frontmatter a `YYYY-MM-DD`. `gray-matter` convierte a
 * `Date` los valores sin comillas (YAML los tipa como fecha) y deja `string` los
 * entrecomillados, así que hay que aceptar ambos. Cualquier otra cosa se descarta:
 * es preferible no publicar `lastmod` a publicar uno inventado.
 */
export function normalizeDate(value: unknown): string | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  }
  return undefined;
}
