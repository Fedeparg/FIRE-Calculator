import "server-only";

import fs from "node:fs/promises";
import path from "node:path";

import matter from "gray-matter";

import { renderMarkdown } from "@/components/wiki/markdown";
import { asLocale } from "@/core/types";

/**
 * Novedades escritas a mano: una entrega por día, `content/changelog/<YYYY-MM-DD>.<locale>.md`.
 * Mismo patrón que la wiki (`components/wiki/content.ts`): frontmatter con `gray-matter`, cuerpo
 * Markdown compilado en runtime y sufijo de idioma. La fecha sale del nombre del fichero, no del
 * frontmatter, para que no pueda discrepar de él. Frontmatter: `title` y `highlight` (hito, opcional).
 */
const CHANGELOG_DIR = path.join(process.cwd(), "content", "changelog");

const RELEASE_FILE = /^(\d{4}-\d{2}-\d{2})\.(es|en)\.md$/;

export interface ChangelogRelease {
  /** `YYYY-MM-DD`, tomada del nombre del fichero. */
  date: string;
  title: string;
  highlight: boolean;
  html: string;
}

/** Fechas de las entregas de un idioma, de más reciente a más antigua. */
export async function getChangelogDates(locale: string): Promise<string[]> {
  let names: string[];
  try {
    names = await fs.readdir(CHANGELOG_DIR);
  } catch {
    return [];
  }

  const dates: string[] = [];
  for (const name of names) {
    const match = RELEASE_FILE.exec(name);
    if (match && match[2] === locale) dates.push(match[1]);
  }
  // ISO: ordena bien como cadena.
  return dates.sort().reverse();
}

/** Entregas de un idioma, de más reciente a más antigua. Un fichero ilegible se omite. */
export async function getChangelog(locale: string): Promise<ChangelogRelease[]> {
  const dates = await getChangelogDates(locale);
  const releases = await Promise.all(
    dates.map(async (date): Promise<ChangelogRelease | null> => {
      let raw: string;
      try {
        raw = await fs.readFile(path.join(CHANGELOG_DIR, `${date}.${locale}.md`), "utf8");
      } catch {
        return null;
      }
      const { data, content } = matter(raw);
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
