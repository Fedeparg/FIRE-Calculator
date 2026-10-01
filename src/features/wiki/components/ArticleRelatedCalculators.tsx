import { getLocale, getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { CALCULATORS } from "@/features/calculators/registry";
import { asLocale } from "@/i18n/types";
import { getRelatedCalculatorSlugs } from "../relatedArticles";

type Props = {
  /** Slug del artículo de la wiki (ver `content/wiki/<slug>.<locale>.md`). */
  articleSlug: string;
};

/**
 * Enlazado interno inverso: desde un artículo hacia las calculadoras que lo
 * referencian (mapeo central en `relatedArticles.ts`). Complementa los chips de
 * "sigue aprendiendo" que van en sentido calculadora → artículo, cerrando el
 * círculo de enlaces. Degradación elegante: si no hay calculadoras
 * relacionadas, no se renderiza nada.
 */
export default async function ArticleRelatedCalculators({ articleSlug }: Props) {
  const locale = asLocale(await getLocale());
  const relatedSlugs = new Set(getRelatedCalculatorSlugs(articleSlug));
  const calculators = CALCULATORS.filter((c) => relatedSlugs.has(c.slug));

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
              {calc.name[locale]}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
