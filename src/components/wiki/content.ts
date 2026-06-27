import "server-only";

import fs from "node:fs/promises";
import path from "node:path";

import matter from "gray-matter";

import { renderMarkdown } from "./markdown";

/** Niveles de dificultad usados para agrupar los artículos en el índice. */
export const WIKI_LEVELS = ["basico", "intermedio", "avanzado"] as const;
export type WikiLevel = (typeof WIKI_LEVELS)[number];

function isWikiLevel(value: unknown): value is WikiLevel {
  return typeof value === "string" && (WIKI_LEVELS as readonly string[]).includes(value);
}

/** Metadatos (frontmatter) de un artículo de la wiki. */
export interface ArticleMeta {
  slug: string;
  title: string;
  description: string;
  level: WikiLevel;
  keywords: string[];
}

/** Artículo completo: metadatos + cuerpo ya renderizado a HTML. */
export interface Article extends ArticleMeta {
  html: string;
}

/** Explainer de una calculadora: metadatos mínimos + cuerpo en HTML. */
export interface Explainer {
  title?: string;
  html: string;
}

const WIKI_DIR = path.join(process.cwd(), "content", "wiki");
const EXPLAINERS_DIR = path.join(WIKI_DIR, "explainers");
const LEGAL_DIR = path.join(process.cwd(), "content", "legal");

/** `<slug>.<locale>.md` → captura slug y locale; ignora subdirectorios. */
const ARTICLE_FILE = /^(.+)\.(es|en)\.md$/;

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function parseArticleMeta(slug: string, data: Record<string, unknown>): ArticleMeta {
  const level = isWikiLevel(data.level) ? data.level : "basico";
  return {
    slug,
    title: typeof data.title === "string" ? data.title : slug,
    description: typeof data.description === "string" ? data.description : "",
    level,
    keywords: toStringArray(data.keywords),
  };
}

async function readFileOrNull(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

/** Lista los slugs de artículos disponibles para un idioma. */
export async function getArticleSlugs(locale: string): Promise<string[]> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(WIKI_DIR, { withFileTypes: true });
  } catch {
    return [];
  }

  const slugs: string[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const match = ARTICLE_FILE.exec(entry.name);
    if (match && match[2] === locale) slugs.push(match[1]);
  }
  return slugs.sort();
}

/** Todos los artículos (solo metadatos) de un idioma, para el índice. */
export async function getAllArticles(locale: string): Promise<ArticleMeta[]> {
  const slugs = await getArticleSlugs(locale);
  const articles = await Promise.all(
    slugs.map(async (slug) => {
      const raw = await readFileOrNull(path.join(WIKI_DIR, `${slug}.${locale}.md`));
      if (raw === null) return null;
      const { data } = matter(raw);
      return parseArticleMeta(slug, data);
    }),
  );
  return articles.filter((article): article is ArticleMeta => article !== null);
}

/** Un artículo completo (metadatos + HTML) o `null` si no existe. */
export async function getArticle(slug: string, locale: string): Promise<Article | null> {
  const raw = await readFileOrNull(path.join(WIKI_DIR, `${slug}.${locale}.md`));
  if (raw === null) return null;
  const { data, content } = matter(raw);
  const meta = parseArticleMeta(slug, data);
  const html = await renderMarkdown(content);
  return { ...meta, html };
}

/** Documento legal (privacidad, aviso legal…): título del frontmatter + HTML. */
export interface LegalDoc {
  title: string;
  updatedAt?: string;
  html: string;
}

/** Slugs de documentos legales disponibles para un idioma. */
export async function getLegalSlugs(locale: string): Promise<string[]> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(LEGAL_DIR, { withFileTypes: true });
  } catch {
    return [];
  }

  const slugs: string[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const match = ARTICLE_FILE.exec(entry.name);
    if (match && match[2] === locale) slugs.push(match[1]);
  }
  return slugs.sort();
}

/** Un documento legal completo (título + HTML) o `null` si no existe. */
export async function getLegalDoc(slug: string, locale: string): Promise<LegalDoc | null> {
  const raw = await readFileOrNull(path.join(LEGAL_DIR, `${slug}.${locale}.md`));
  if (raw === null) return null;
  const { data, content } = matter(raw);
  const html = await renderMarkdown(content);
  return {
    title: typeof data.title === "string" ? data.title : slug,
    updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : undefined,
    html,
  };
}

/** Explainer de una calculadora o `null` si todavía no existe (degradación). */
export async function getExplainer(calcSlug: string, locale: string): Promise<Explainer | null> {
  const raw = await readFileOrNull(path.join(EXPLAINERS_DIR, `${calcSlug}.${locale}.md`));
  if (raw === null) return null;
  const { data, content } = matter(raw);
  const html = await renderMarkdown(content);
  const title = typeof data.title === "string" ? data.title : undefined;
  return { title, html };
}
