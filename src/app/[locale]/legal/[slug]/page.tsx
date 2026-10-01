import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { routing } from "@/i18n/routing";
import { getLegalDoc, getLegalSlugs } from "@/components/wiki/content";
import { buildMetadata } from "@/lib/seo";

// Documentos legales: estáticos, se regeneran cada hora (igual que la wiki).
export const revalidate = 3600;
export const dynamicParams = true;

type Props = { params: Promise<{ locale: string; slug: string }> };

export async function generateStaticParams() {
  const slugSets = await Promise.all(routing.locales.map((locale) => getLegalSlugs(locale)));
  const slugs = [...new Set(slugSets.flat())];
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const doc = await getLegalDoc(slug, locale);
  if (!doc) return {};
  return buildMetadata({
    locale,
    path: `/legal/${slug}`,
    title: doc.title,
    description: doc.title,
  });
}

export default async function LegalPage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("legal");

  const doc = await getLegalDoc(slug, locale);
  if (!doc) notFound();

  return (
    <article className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-bold text-foreground">{doc.title}</h1>
      {doc.updatedAt && <p className="mt-2 text-sm text-muted">{t("lastUpdated", { date: doc.updatedAt })}</p>}
      <div
        className="prose prose-neutral mt-6 max-w-none dark:prose-invert prose-headings:text-foreground prose-a:text-brand prose-strong:text-foreground"
        dangerouslySetInnerHTML={{ __html: doc.html }}
      />
    </article>
  );
}
