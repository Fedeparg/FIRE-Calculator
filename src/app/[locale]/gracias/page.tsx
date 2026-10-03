import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Link } from "@/i18n/navigation";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "thanks" });
  return { title: t("meta.title"), robots: { index: false } };
}

/** Landing page after a completed donation (Stripe Checkout success_url). */
export default async function ThanksPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("thanks");

  return (
    <section className="mx-auto max-w-2xl px-4 py-20 text-center">
      <span className="text-5xl" aria-hidden>
        ☕
      </span>
      <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground">{t("title")}</h1>
      <p className="mt-3 text-lg text-muted">{t("body")}</p>
      <Link
        href="/"
        className="mt-8 inline-flex items-center justify-center rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-brand-fg transition hover:opacity-90"
      >
        {t("backHome")}
      </Link>
    </section>
  );
}
