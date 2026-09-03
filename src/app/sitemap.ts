import type { MetadataRoute } from "next";

import { CALCULATORS } from "@/core/registry";
import { LOCALES } from "@/core/types";
import {
  getArticleSlugs,
  getContentUpdatedDates,
  getLegalSlugs,
} from "@/components/wiki/content";
import { getChangelogLastUpdated } from "@/components/changelog/content";
import { absoluteUrl } from "@/lib/site";
import { localizedPath } from "@/lib/seo";

/**
 * Sitemap dinámico. Genera UNA entrada por página con sus variantes de idioma en
 * `alternates.languages` (hreflang es/en + x-default), en lugar de listar es y en
 * como URLs independientes. Las rutas privadas o sin valor de indexación
 * (portfolio, login, callbacks, gracias, oauth) se omiten a propósito.
 *
 * Las fuentes son las mismas que alimentan la app: el registro de calculadoras y
 * los ficheros Markdown de la wiki/legal, de modo que añadir contenido actualiza
 * el sitemap sin tocar este fichero.
 *
 * `lastModified` solo se emite cuando hay una fecha REAL de revisión (`updated` en
 * el frontmatter del artículo, `updatedAt` en el de los legales). Antes se ponía
 * `new Date()` en todas las entradas: un `lastmod` que cambia en cada rastreo no
 * aporta información y los buscadores acaban ignorándolo, así que es mejor omitirlo
 * donde no se sabe. Las calculadoras y las páginas fijas no llevan fecha porque su
 * contenido lo genera el código, no un fichero con historial propio.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [esArticles, enArticles, esLegal, enLegal, articleDates, legalDates, changelogDate] =
    await Promise.all([
      getArticleSlugs("es"),
      getArticleSlugs("en"),
      getLegalSlugs("es"),
      getLegalSlugs("en"),
      getContentUpdatedDates("wiki"),
      getContentUpdatedDates("legal"),
      getChangelogLastUpdated(),
    ]);

  const articleSlugs = [...new Set([...esArticles, ...enArticles])].sort();
  const legalSlugs = [...new Set([...esLegal, ...enLegal])].sort();
  const liveCalculators = CALCULATORS.filter((c) => c.status === "live");

  /** Una entrada con su URL canónica (es) y el mapa hreflang completo. */
  const entry = (
    path: string,
    priority: number,
    changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"],
    lastModified?: string,
  ): MetadataRoute.Sitemap[number] => {
    const languages: Record<string, string> = {};
    for (const locale of LOCALES) {
      languages[locale] = absoluteUrl(localizedPath(locale, path));
    }
    languages["x-default"] = absoluteUrl(localizedPath("es", path));
    return {
      url: absoluteUrl(localizedPath("es", path)),
      // Se omite la clave entera cuando no hay fecha fiable (ver cabecera).
      ...(lastModified ? { lastModified } : {}),
      changeFrequency,
      priority,
      alternates: { languages },
    };
  };

  return [
    entry("/", 1, "weekly"),
    entry("/calculadoras", 0.9, "weekly"),
    entry("/aprende", 0.8, "weekly"),
    // Aquí SÍ hay una fecha real de contenido (la entrega más reciente), a
    // diferencia de las calculadoras: se emite el `lastmod`.
    entry("/novedades", 0.5, "weekly", changelogDate),
    entry("/sobre-mi", 0.3, "yearly"),
    ...liveCalculators.map((c) => entry(`/calculadoras/${c.slug}`, 0.8, "monthly")),
    ...articleSlugs.map((slug) =>
      entry(`/aprende/${slug}`, 0.7, "monthly", articleDates.get(slug)),
    ),
    ...legalSlugs.map((slug) => entry(`/legal/${slug}`, 0.2, "yearly", legalDates.get(slug))),
  ];
}
