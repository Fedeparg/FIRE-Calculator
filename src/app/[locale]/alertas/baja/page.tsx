import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import UnsubscribeConfirm from "@/features/account/components/UnsubscribeConfirm";
import RouteMessages from "@/i18n/RouteMessages";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string | string[] }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "unsubscribe" });
  // Only reachable from an email: nothing to index.
  return { title: t("title"), robots: { index: false, follow: false } };
}

/** Unsubscribe from email alerts, from the link in the email (no session). */
export default async function UnsubscribePage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("unsubscribe");
  const { token } = await searchParams;

  return (
    <RouteMessages route="alertas/baja">
      <section className="mx-auto flex max-w-xl flex-col items-center gap-4 px-4 py-20 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{t("title")}</h1>
        <p className="text-muted">{t("body")}</p>
        <UnsubscribeConfirm token={typeof token === "string" && token ? token : null} />
      </section>
    </RouteMessages>
  );
}
