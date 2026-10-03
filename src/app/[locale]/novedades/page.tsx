import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { asLocale } from "@/i18n/types";
import { getChangelog } from "@/features/changelog/content";
import ChangelogTimeline from "@/features/changelog/components/ChangelogTimeline";
import { buildMetadata } from "@/shared/seo/seo";

// ISR: like the wiki, releases are read from `content/changelog/*.md` at runtime, so
// editing a file on the server publishes itself, without a redeploy.
export const revalidate = 3600;

// The slug is not translated, just like `/calculadoras` and `/aprende`: a single URL per
// page in both locales, with `/en` as the English prefix.
type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "changelog" });
  return buildMetadata({
    locale,
    path: "/novedades",
    og: { kind: "page", page: "changelog" },
    title: t("heading"),
    description: t("subheading"),
  });
}

export default async function ChangelogPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("changelog");

  const releases = await getChangelog(locale);

  return (
    <section className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{t("heading")}</h1>
      <p className="mt-3 max-w-2xl text-muted">{t("subheading")}</p>

      {releases.length === 0 ? (
        <p className="mt-10 text-muted">{t("empty")}</p>
      ) : (
        <ChangelogTimeline releases={releases} locale={asLocale(locale)} />
      )}
    </section>
  );
}
