import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import DonationWidget from "@/features/donations/components/DonationWidget";
import { DONATIONS_ENABLED } from "@/features/donations/config";
import { buildMetadata } from "@/lib/seo";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "about" });
  return buildMetadata({
    locale,
    path: "/sobre-mi",
    title: t("meta.title"),
    description: t("meta.description"),
  });
}

export default async function AboutPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("about");

  return (
    <article className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight text-foreground">{t("title")}</h1>
      <p className="mt-2 text-lg text-muted">{t("intro")}</p>

      <div className="prose prose-neutral mt-8 max-w-none dark:prose-invert prose-headings:text-foreground prose-a:text-brand prose-strong:text-foreground">
        <h2>{t("whoTitle")}</h2>
        <p>{t("whoBody")}</p>
        <h2>{t("whyTitle")}</h2>
        <p>{t("whyBody")}</p>
      </div>

      {DONATIONS_ENABLED && (
        <section id="apoya" className="mt-12 scroll-mt-24">
          <h2 className="text-2xl font-bold tracking-tight text-foreground">
            <span aria-hidden>☕ </span>
            {t("supportTitle")}
          </h2>
          <p className="mt-3 text-muted">{t("supportBody")}</p>
          <div className="mt-5">
            <DonationWidget />
          </div>
        </section>
      )}
    </article>
  );
}
