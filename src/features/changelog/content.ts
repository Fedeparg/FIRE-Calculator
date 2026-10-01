import "server-only";

import path from "node:path";

import { listLocalizedSlugs, readLocalizedMarkdown } from "@/shared/content/localized-markdown";
import { renderMarkdown } from "@/shared/content/markdown";
import { asLocale } from "@/i18n/types";

/**
 * Novedades escritas a mano: una entrega por día, `content/changelog/<YYYY-MM-DD>.<locale>.md`.
 * Mismo patrón que la wiki (primitivas en `shared/content/localized-markdown.ts`): frontmatter, cuerpo
 * Markdown compilado en runtime y sufijo de idioma. La fecha sale del nombre del fichero, no del
 * frontmatter, para que no pueda discrepar de él. Frontmatter: `title` y `highlight` (hito, opcional).
 */
const CHANGELOG_DIR = path.join(process.cwd(), "content", "changelog");

/** Slug de una entrega: su fecha ISO. */
const RELEASE_DATE = "\\d{4}-\\d{2}-\\d{2}";

export interface ChangelogRelease {
  /** `YYYY-MM-DD`, tomada del nombre del fichero. */
  date: string;
  title: string;
  highlight: boolean;
  html: string;
}

/** Fechas de las entregas de un idioma, de más reciente a más antigua. */
export async function getChangelogDates(locale: string): Promise<string[]> {
  // ISO: ordena bien como cadena.
  return (await listLocalizedSlugs(CHANGELOG_DIR, locale, RELEASE_DATE)).reverse();
}

/** Entregas de un idioma, de más reciente a más antigua. Un fichero ilegible se omite. */
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
 * Fecha de la entrega más reciente (`YYYY-MM-DD`) o `undefined` si no hay ninguna.
 * Alimenta el `lastModified` del sitemap: aquí sí hay una fecha REAL de contenido,
 * a diferencia de las calculadoras (ver la cabecera de `app/sitemap.ts`).
 */
export async function getChangelogLastUpdated(): Promise<string | undefined> {
  return (await getChangelogDates("es"))[0];
}
