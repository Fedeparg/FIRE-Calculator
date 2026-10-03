import "server-only";

import path from "node:path";

import { listLocalizedSlugs, readLocalizedMarkdown } from "@/shared/content/localized-markdown";
import { renderMarkdown } from "@/shared/content/markdown";
import { asLocale } from "@/i18n/types";

/**
 * Hand-written changelog ("Novedades"): one release per day, `content/changelog/<YYYY-MM-DD>.<locale>.md`.
 * Same pattern as the wiki (primitives in `shared/content/localized-markdown.ts`): frontmatter, a
 * Markdown body compiled at runtime and a locale suffix. The date comes from the file name, not the
 * frontmatter, so the two cannot disagree. Frontmatter: `title` and `highlight` (milestone, optional).
 */
const CHANGELOG_DIR = path.join(process.cwd(), "content", "changelog");

/** A release's slug: its ISO date. */
const RELEASE_DATE = "\\d{4}-\\d{2}-\\d{2}";

export interface ChangelogRelease {
  /** `YYYY-MM-DD`, taken from the file name. */
  date: string;
  title: string;
  highlight: boolean;
  html: string;
}

/** Release dates for one locale, newest first. */
export async function getChangelogDates(locale: string): Promise<string[]> {
  // ISO: sorts correctly as a string.
  return (await listLocalizedSlugs(CHANGELOG_DIR, locale, RELEASE_DATE)).reverse();
}

/** Releases for one locale, newest first. An unreadable file is skipped. */
export async function getChangelog(locale: string): Promise<ChangelogRelease[]> {
  const dates = await getChangelogDates(locale);
  const releases = await Promise.all(
    dates.map(async (date): Promise<ChangelogRelease | null> => {
      const file = await readLocalizedMarkdown(CHANGELOG_DIR, date, locale);
      if (!file) return null;
      const { data, content } = file;
      return {
        date,
        title: typeof data.title === "string" ? data.title : "",
        highlight: data.highlight === true,
        html: await renderMarkdown(content, asLocale(locale)),
      };
    }),
  );
  return releases.filter((release): release is ChangelogRelease => release !== null);
}

/**
 * Date of the latest release (`YYYY-MM-DD`), or `undefined` if there is none.
 * Feeds the sitemap's `lastModified`: here there IS a real content date, unlike the
 * calculators (see the header of `app/sitemap.ts`).
 */
export async function getChangelogLastUpdated(): Promise<string | undefined> {
  return (await getChangelogDates("es"))[0];
}
