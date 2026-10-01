import { getLocale, getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { getExplainer, getArticle } from "../content";
import { getRelatedArticleSlugs } from "../relatedArticles";

type Props = {
  /** Slug de la calculadora (ver `src/features/calculators/registry.ts`). */
  calcSlug: string;
};

type Chip = { slug: string; title: string };

/**
 * Bloque divulgativo bajo cada calculadora: una explicación con ejemplo
 * trabajado (leída de `content/wiki/explainers/<calc>.<locale>.md`) y, debajo,
 * chips que enlazan a los artículos relacionados de la wiki (mapeo central en
 * `relatedArticles.ts`).
 *
 * Degradación elegante: si la calculadora no tiene explainer NI artículos
 * relacionados, no se renderiza nada.
 */
export default async function CalculatorExplainer({ calcSlug }: Props) {
  const locale = await getLocale();
  const [explainer, chips] = await Promise.all([getExplainer(calcSlug, locale), resolveChips(calcSlug, locale)]);

  if (!explainer && chips.length === 0) return null;

  const t = await getTranslations("wiki.explainer");

  return (
    <section className="mt-12 border-t border-border pt-8">
      {explainer && (
        <>
          <h2 className="text-xl font-bold tracking-tight text-foreground">{explainer.title ?? t("heading")}</h2>
          <div
            className="prose prose-neutral mt-4 max-w-none dark:prose-invert prose-headings:text-foreground prose-a:text-brand prose-strong:text-foreground"
            dangerouslySetInnerHTML={{ __html: explainer.html }}
          />
        </>
      )}

      {chips.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">{t("relatedHeading")}</h3>
          <ul className="mt-3 flex flex-wrap gap-2">
            {chips.map((chip) => (
              <li key={chip.slug}>
                <Link
                  href={`/aprende/${chip.slug}`}
                  className="inline-block rounded-full border border-border bg-surface-2 px-3 py-1 text-sm text-foreground transition-colors hover:border-brand hover:text-brand"
                >
                  {chip.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** Resuelve los slugs relacionados a chips con el título del artículo. */
async function resolveChips(calcSlug: string, locale: string): Promise<Chip[]> {
  const slugs = getRelatedArticleSlugs(calcSlug);
  const resolved = await Promise.all(
    slugs.map(async (slug) => {
      const article = await getArticle(slug, locale);
      return article ? { slug, title: article.title } : null;
    }),
  );
  return resolved.filter((chip): chip is Chip => chip !== null);
}
