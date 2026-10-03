import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";

type Props = {
  /** Related calculators, already resolved by the route (with names in the active locale). */
  calculators: readonly { slug: string; name: string }[];
};

/**
 * Reverse internal linking: from an article to the calculators that reference it (the route
 * resolves the `related-articles.ts` mapping against the registry, so the wiki does not depend
 * on the calculators). It complements the "sigue aprendiendo" (keep learning) chips that go from
 * calculator → article, closing the link loop. Graceful degradation: if there are no related
 * calculators, nothing is rendered.
 */
export default async function ArticleRelatedCalculators({ calculators }: Props) {
  if (calculators.length === 0) return null;

  const t = await getTranslations("wiki");

  return (
    <section className="mt-12 border-t border-border pt-8">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{t("relatedCalculators")}</h2>
      <ul className="mt-3 flex flex-wrap gap-2">
        {calculators.map((calc) => (
          <li key={calc.slug}>
            <Link
              href={`/calculadoras/${calc.slug}`}
              className="inline-block rounded-full border border-border bg-surface-2 px-3 py-1 text-sm text-foreground transition-colors hover:border-brand hover:text-brand"
            >
              {calc.name}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
