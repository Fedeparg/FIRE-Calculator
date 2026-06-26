import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { getArticle, getArticleSlugs } from "@/components/wiki/content";

// ISR + dynamicParams: las rutas conocidas se prerenderizan; slugs nuevos
// (artículos añadidos sin redeploy) se generan bajo demanda y se cachean.
export const revalidate = 3600;
export const dynamicParams = true;

type Props = { params: Promise<{ locale: string; slug: string }> };

export async function generateStaticParams() {
  // Los slugs son compartidos entre idiomas (mismo fichero, distinto sufijo).
  const slugSets = await Promise.all(routing.locales.map((locale) => getArticleSlugs(locale)));
  const slugs = [...new Set(slugSets.flat())];
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const article = await getArticle(slug, locale);
  if (!article) return {};
  return { title: article.title, description: article.description };
}

export default async function ArticlePage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("wiki");

  const article = await getArticle(slug, locale);
  if (!article) notFound();

  return (
    <article className="mx-auto max-w-3xl px-4 py-10">
      <Link href="/aprende" className="text-sm font-medium text-brand hover:underline">
        ← {t("backToIndex")}
      </Link>

      <div
        className="prose prose-neutral mt-6 max-w-none dark:prose-invert prose-headings:text-foreground prose-a:text-brand prose-strong:text-foreground"
        dangerouslySetInnerHTML={{ __html: article.html }}
      />
    </article>
  );
}
