import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { getAllArticles, WIKI_LEVELS, type ArticleMeta } from "@/components/wiki/content";
import AdSlot from "@/components/AdSlot";

// ISR: el contenido se lee de ficheros Markdown en runtime; se revalida cada
// hora y bajo demanda vía /api/revalidate, de modo que editar la wiki en el
// servidor no requiere redesplegar.
export const revalidate = 3600;

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "wiki" });
  return { title: t("heading"), description: t("subheading") };
}

export default async function LearnIndexPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("wiki");

  const articles = await getAllArticles(locale);
  const byLevel = WIKI_LEVELS.map((level) => ({
    level,
    items: articles.filter((article) => article.level === level),
  })).filter((group) => group.items.length > 0);

  return (
    <section className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
        {t("heading")}
      </h1>
      <p className="mt-3 max-w-2xl text-muted">{t("subheading")}</p>

      {articles.length === 0 ? (
        <p className="mt-8 text-muted">{t("empty")}</p>
      ) : (
        <div className="mt-10 space-y-10">
          {byLevel.map((group) => (
            <div key={group.level}>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
                {t(`level.${group.level}`)}
              </h2>
              <ul className="mt-4 grid gap-4 sm:grid-cols-2">
                {group.items.map((article) => (
                  <ArticleCard key={article.slug} article={article} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      <AdSlot className="mt-12" />
    </section>
  );
}

function ArticleCard({ article }: { article: ArticleMeta }) {
  return (
    <li>
      <Link
        href={`/aprende/${article.slug}`}
        className="block h-full rounded-xl border border-border bg-surface p-5 transition-colors hover:border-brand"
      >
        <h3 className="font-semibold text-foreground">{article.title}</h3>
        <p className="mt-2 text-sm text-muted">{article.description}</p>
      </Link>
    </li>
  );
}
