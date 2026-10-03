import fs from "node:fs/promises";
import path from "node:path";

import matter from "gray-matter";

/**
 * Primitives for locale-suffixed Markdown content (`<slug>.<locale>.md`) shared by the wiki, the
 * legal pages, the explainers and the changelog. No `server-only` and no Next dependencies: they
 * read from disk and are tested against a temporary directory. Rendering to HTML
 * (`renderMarkdown`) is left to the caller, because metadata is often read without the body.
 */

/**
 * Default valid slug: lowercase letters, digits and hyphens (all content complies). The changelog
 * narrows it further, to an ISO date. Using the same rule for listing and reading avoids
 * prerendering a slug that cannot be read afterwards.
 */
const SAFE_SLUG = "[a-z0-9-]+";
const SAFE_SLUG_RE = new RegExp(`^${SAFE_SLUG}$`);
const LOCALE_SUFFIX = "es|en";
const LOCALE_RE = new RegExp(`^(${LOCALE_SUFFIX})$`);

export interface LocalizedFile {
  slug: string;
  locale: string;
  /** File name within its directory. */
  fileName: string;
}

export interface ParsedMarkdown {
  /** YAML frontmatter (empty if there is none). */
  data: Record<string, unknown>;
  content: string;
}

/**
 * `<slug>.<es|en>.md` files in a directory, in any locale. A missing directory counts as an
 * empty one: content is optional and degrades silently. Subdirectories (e.g. `explainers/`) are
 * ignored.
 */
export async function listLocalizedFiles(dir: string, slugPattern: string = SAFE_SLUG): Promise<LocalizedFile[]> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const fileRe = new RegExp(`^(${slugPattern})\\.(${LOCALE_SUFFIX})\\.md$`);
  const files: LocalizedFile[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const match = fileRe.exec(entry.name);
    const [, slug, locale] = match ?? [];
    // Both groups are mandatory in `fileRe`: if there is a `match`, they are present.
    if (slug !== undefined && locale !== undefined) files.push({ slug, locale, fileName: entry.name });
  }
  return files;
}

/** Slugs available in a locale, sorted alphabetically. */
export async function listLocalizedSlugs(
  dir: string,
  locale: string,
  slugPattern: string = SAFE_SLUG,
): Promise<string[]> {
  const files = await listLocalizedFiles(dir, slugPattern);
  return files
    .filter((file) => file.locale === locale)
    .map((file) => file.slug)
    .sort();
}

/** Reads and parses an `.md`; `null` if it cannot be read. A broken YAML frontmatter does throw. */
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

/**
 * Parsed `<dir>/<slug>.<locale>.md`, or `null` if it does not exist (no fallback to another
 * locale). The slug and locale come from the URL (`dynamicParams`), so they are validated BEFORE
 * touching the disk: with `../` or separators, `path.join` would escape the content directory.
 */
export async function readLocalizedMarkdown(dir: string, slug: string, locale: string): Promise<ParsedMarkdown | null> {
  if (!SAFE_SLUG_RE.test(slug) || !LOCALE_RE.test(locale)) return null;
  return readMarkdownFile(path.join(dir, `${slug}.${locale}.md`));
}

/**
 * Normalizes a frontmatter date to `YYYY-MM-DD`. `gray-matter` turns unquoted values into
 * `Date` (YAML types them as dates) and leaves quoted ones as `string`, so both must be
 * accepted. Anything else is discarded: publishing no `lastmod` beats publishing a made-up one.
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
