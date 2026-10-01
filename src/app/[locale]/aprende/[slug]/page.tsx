import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { routing } from "@/i18n/routing";
import { asLocale } from "@/core/types";
import { SITE_NAME } from "@/lib/site";
import { articleSchema } from "@/lib/jsonld";
import { getArticle, getArticleSlugs } from "@/features/wiki/content";
import ArticleRelatedCalculators from "@/features/wiki/components/ArticleRelatedCalculators";
import { buildMetadata } from "@/lib/seo";
import Breadcrumbs from "@/components/seo/Breadcrumbs";
import JsonLd from "@/components/seo/JsonLd";

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
  return buildMetadata({
    locale,
    path: `/aprende/${slug}`,
    title: article.title,
    description: article.description,
    ogType: "article",
  });
}

export default async function ArticlePage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const tNav = await getTranslations("nav");

  const article = await getArticle(slug, locale);
  if (!article) notFound();

  return (
    <article className="mx-auto max-w-3xl px-4 py-10">
      <Breadcrumbs
        items={[
          { name: SITE_NAME, path: "/" },
          { name: tNav("learn"), path: "/aprende" },
          { name: article.title, path: `/aprende/${slug}` },
        ]}
      />

      <JsonLd
        data={articleSchema({
          locale: asLocale(locale),
          slug,
          title: article.title,
          description: article.description,
        })}
      />

      <div
        className="prose prose-neutral mt-6 max-w-none dark:prose-invert prose-headings:text-foreground prose-a:text-brand prose-strong:text-foreground"
        dangerouslySetInnerHTML={{ __html: article.html }}
      />

      {/* Enlazado interno: calculadoras que usan este concepto. */}
      <ArticleRelatedCalculators articleSlug={slug} />
    </article>
  );
}
