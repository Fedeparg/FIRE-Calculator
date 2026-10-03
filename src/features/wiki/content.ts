import "server-only";

import path from "node:path";

import { cache } from "react";

import {
  listLocalizedFiles,
  listLocalizedSlugs,
  normalizeDate,
  readLocalizedMarkdown,
  readMarkdownFile,
} from "@/shared/content/localized-markdown";
import { renderMarkdown } from "@/shared/content/markdown";
import { asLocale } from "@/i18n/types";

/** Difficulty levels used to group the articles in the index. */
export const WIKI_LEVELS = ["basico", "intermedio", "avanzado"] as const;
export type WikiLevel = (typeof WIKI_LEVELS)[number];

function isWikiLevel(value: unknown): value is WikiLevel {
  return typeof value === "string" && (WIKI_LEVELS as readonly string[]).includes(value);
}

/** Metadata (frontmatter) of a wiki article. */
export interface ArticleMeta {
  slug: string;
  title: string;
  description: string;
  level: WikiLevel;
  keywords: string[];
  /**
   * Date the content was last actually reviewed (`updated: 2026-09-03` in the
   * frontmatter). It is OPTIONAL on purpose: only whoever reviews the text sets it.
   * It feeds the sitemap's `lastmod`, which is noise without real data — a
   * `lastmod` that changes on every crawl makes Google stop trusting it.
   */
  updated?: string;
}

/** Full article: metadata + body already rendered to HTML. */
export interface Article extends ArticleMeta {
  html: string;
}

/** A calculator's explainer: minimal metadata + HTML body. */
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

/** Lists the article slugs available for a locale. */
export function getArticleSlugs(locale: string): Promise<string[]> {
  return listLocalizedSlugs(WIKI_DIR, locale);
}

/** All articles (metadata only) for a locale, for the index. */
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

/**
 * A full article (metadata + HTML), or `null` if it does not exist.
 *
 * React's `cache` memoizes the result for ONE server request: `generateMetadata` and the page
 * request the same article, and without it the article was read and rendered twice. It is not a
 * cross-request cache (ISR takes care of that).
 */
export const getArticle = cache(async (slug: string, locale: string): Promise<Article | null> => {
  const file = await readLocalizedMarkdown(WIKI_DIR, slug, locale);
  if (!file) return null;
  const meta = parseArticleMeta(slug, file.data);
  const html = await renderMarkdown(file.content, asLocale(locale));
  return { ...meta, html };
});

/** Legal document (privacy, legal notice…): frontmatter title + HTML. */
export interface LegalDoc {
  title: string;
  updatedAt?: string;
  html: string;
}

/** Slugs of the legal documents available for a locale. */
export function getLegalSlugs(locale: string): Promise<string[]> {
  return listLocalizedSlugs(LEGAL_DIR, locale);
}

/** A full legal document (title + HTML), or `null` if it does not exist. Memoized per request (see `getArticle`). */
export const getLegalDoc = cache(async (slug: string, locale: string): Promise<LegalDoc | null> => {
  const file = await readLocalizedMarkdown(LEGAL_DIR, slug, locale);
  if (!file) return null;
  const { data } = file;
  const html = await renderMarkdown(file.content, asLocale(locale));
  return {
    title: typeof data.title === "string" ? data.title : slug,
    updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : undefined,
    html,
  };
});

/**
 * Last review date per slug, for the sitemap's `lastmod`. It walks BOTH locales and keeps
 * the most recent: if only the Spanish version was reviewed, that is the date the content
 * last changed.
 *
 * Only slugs that declare a date appear; the rest are left out of the map (and of
 * `lastmod`) instead of getting today's date.
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

/** A calculator's explainer, or `null` if it does not exist yet (degradation). Memoized per request. */
export const getExplainer = cache(async (calcSlug: string, locale: string): Promise<Explainer | null> => {
  const file = await readLocalizedMarkdown(EXPLAINERS_DIR, calcSlug, locale);
  if (!file) return null;
  const html = await renderMarkdown(file.content, asLocale(locale));
  const title = typeof file.data.title === "string" ? file.data.title : undefined;
  return { title, html };
});
