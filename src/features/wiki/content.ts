import "server-only";

import path from "node:path";

import {
  listLocalizedFiles,
  listLocalizedSlugs,
  normalizeDate,
  readLocalizedMarkdown,
  readMarkdownFile,
} from "@/shared/content/localized-markdown";
import { renderMarkdown } from "@/shared/content/markdown";
import { asLocale } from "@/i18n/types";

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
  /**
   * Fecha de última revisión real del contenido (`updated: 2026-09-03` en el
   * frontmatter). Es OPCIONAL a propósito: solo la escribe quien revisa el texto.
   * Alimenta el `lastmod` del sitemap, que sin un dato de verdad es ruido — un
   * `lastmod` que cambia en cada rastreo hace que Google deje de creérselo.
   */
  updated?: string;
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
    updated: normalizeDate(data.updated),
  };
}

/** Lista los slugs de artículos disponibles para un idioma. */
export function getArticleSlugs(locale: string): Promise<string[]> {
  return listLocalizedSlugs(WIKI_DIR, locale);
}

/** Todos los artículos (solo metadatos) de un idioma, para el índice. */
export async function getAllArticles(locale: string): Promise<ArticleMeta[]> {
  const slugs = await getArticleSlugs(locale);
  const articles = await Promise.all(
    slugs.map(async (slug) => {
      const file = await readLocalizedMarkdown(WIKI_DIR, slug, locale);
      return file && parseArticleMeta(slug, file.data);
    }),
  );
  return articles.filter((article): article is ArticleMeta => article !== null);
}

/** Un artículo completo (metadatos + HTML) o `null` si no existe. */
export async function getArticle(slug: string, locale: string): Promise<Article | null> {
  const file = await readLocalizedMarkdown(WIKI_DIR, slug, locale);
  if (!file) return null;
  const meta = parseArticleMeta(slug, file.data);
  const html = await renderMarkdown(file.content, asLocale(locale));
  return { ...meta, html };
}

/** Documento legal (privacidad, aviso legal…): título del frontmatter + HTML. */
export interface LegalDoc {
  title: string;
  updatedAt?: string;
  html: string;
}

/** Slugs de documentos legales disponibles para un idioma. */
export function getLegalSlugs(locale: string): Promise<string[]> {
  return listLocalizedSlugs(LEGAL_DIR, locale);
}

/** Un documento legal completo (título + HTML) o `null` si no existe. */
export async function getLegalDoc(slug: string, locale: string): Promise<LegalDoc | null> {
  const file = await readLocalizedMarkdown(LEGAL_DIR, slug, locale);
  if (!file) return null;
  const { data } = file;
  const html = await renderMarkdown(file.content, asLocale(locale));
  return {
    title: typeof data.title === "string" ? data.title : slug,
    updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : undefined,
    html,
  };
}

/**
 * Fecha de última revisión por slug, para el `lastmod` del sitemap. Recorre AMBOS
 * idiomas y se queda con la más reciente: si solo se ha revisado la versión en
 * castellano, esa es la fecha en que el contenido cambió por última vez.
 *
 * Solo aparecen los slugs que declaran fecha; los demás se omiten del mapa (y del
 * `lastmod`) en vez de recibir la fecha de hoy.
 */
export async function getContentUpdatedDates(kind: "wiki" | "legal"): Promise<Map<string, string>> {
  const dir = kind === "wiki" ? WIKI_DIR : LEGAL_DIR;
  const field = kind === "wiki" ? "updated" : "updatedAt";

  const dates = new Map<string, string>();
  const files = await listLocalizedFiles(dir);
  await Promise.all(
    files.map(async ({ slug, fileName }) => {
      const file = await readMarkdownFile(path.join(dir, fileName));
      const updated = normalizeDate(file?.data[field]);
      if (!updated) return;
      const current = dates.get(slug);
      if (!current || updated > current) dates.set(slug, updated);
    }),
  );
  return dates;
}

/** Explainer de una calculadora o `null` si todavía no existe (degradación). */
export async function getExplainer(calcSlug: string, locale: string): Promise<Explainer | null> {
  const file = await readLocalizedMarkdown(EXPLAINERS_DIR, calcSlug, locale);
  if (!file) return null;
  const html = await renderMarkdown(file.content, asLocale(locale));
  const title = typeof file.data.title === "string" ? file.data.title : undefined;
  return { title, html };
}
