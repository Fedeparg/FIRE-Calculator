import { getTranslations } from "next-intl/server";

import { formatLongDate } from "@/shared/format/format";
import type { Locale } from "@/i18n/types";

import type { ChangelogRelease } from "../content";

/**
 * Release timeline. Server component: there are no filters or state, so it ships no JavaScript
 * to the client and the route is prerendered with ISR, just like the wiki.
 */
type Props = {
  /** Releases already resolved to one locale, newest first. */
  releases: ChangelogRelease[];
  locale: Locale;
};

export default async function ChangelogTimeline({ releases, locale }: Props) {
  const t = await getTranslations("changelog");

  return (
    <ol role="list" className="relative mt-10 space-y-8">
      {releases.map((release, index) => (
        <li key={release.date} className="relative pl-8 sm:pl-10">
          {/* Timeline node. The node spans 0-16 px horizontally (centred at 8 px) and the
              thread sits at 7 px, so both share an axis. The thread is drawn per item and
              reaches exactly the next one (`-bottom-8` = the `space-y-8` gap), instead of a
              single bar that would overshoot the end. */}
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
            {/* The HTML comes from trusted Markdown in `content/changelog` (remark drops embedded
                HTML), just like the wiki articles. */}
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
