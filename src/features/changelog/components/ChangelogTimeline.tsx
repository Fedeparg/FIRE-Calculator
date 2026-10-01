import { getTranslations } from "next-intl/server";

import { formatLongDate } from "@/shared/format/format";
import type { Locale } from "@/i18n/types";

import type { ChangelogRelease } from "../content";

/**
 * Línea temporal de entregas. Componente de servidor: no hay filtros ni estado, así que no
 * envía JavaScript al cliente y la ruta se prerenderiza con ISR igual que la wiki.
 */
type Props = {
  /** Entregas ya resueltas a un idioma, de más reciente a más antigua. */
  releases: ChangelogRelease[];
  locale: Locale;
};

export default async function ChangelogTimeline({ releases, locale }: Props) {
  const t = await getTranslations("changelog");

  return (
    <ol role="list" className="relative mt-10 space-y-8">
      {releases.map((release, index) => (
        <li key={release.date} className="relative pl-8 sm:pl-10">
          {/* Nodo de la línea temporal. El nodo ocupa 0-16 px en horizontal (centro en
              8 px) y el hilo va a 7 px, de modo que ambos comparten eje. El hilo se
              dibuja por elemento y llega justo al siguiente (`-bottom-8` = el hueco de
              `space-y-8`), en vez de ser una barra única que sobresaldría por el final. */}
          {index < releases.length - 1 && (
            <span aria-hidden className="absolute -bottom-8 left-[7px] top-6 w-px bg-border" />
          )}
          <span
            aria-hidden
            className={`absolute left-0 top-1.5 h-4 w-4 rounded-full border-2 ${
              release.highlight ? "border-brand bg-brand" : "border-border bg-surface"
            }`}
          />

          <article
            className={`rounded-xl border p-4 sm:p-5 ${
              release.highlight ? "border-brand bg-brand-soft" : "border-border bg-surface"
            }`}
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <time dateTime={release.date} className="text-xs font-semibold uppercase tracking-wide text-muted">
                {formatLongDate(release.date, locale)}
              </time>
              {release.highlight && (
                <span className="rounded-full bg-brand px-2 py-0.5 text-xs font-semibold text-brand-fg">
                  {t("highlight")}
                </span>
              )}
            </div>
            <h2 className="mt-1 text-lg font-semibold text-foreground">{release.title}</h2>
            {/* El HTML sale de Markdown de confianza en `content/changelog` (remark descarta HTML
                embebido), igual que los artículos de la wiki. */}
            <div
              className="prose prose-neutral mt-2 max-w-none text-sm dark:prose-invert prose-a:text-brand prose-strong:text-foreground"
              dangerouslySetInnerHTML={{ __html: release.html }}
            />
          </article>
        </li>
      ))}
    </ol>
  );
}
