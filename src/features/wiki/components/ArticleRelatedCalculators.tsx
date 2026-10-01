import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";

type Props = {
  /** Calculadoras relacionadas, ya resueltas (con el nombre en el idioma activo) por la ruta. */
  calculators: readonly { slug: string; name: string }[];
};

/**
 * Enlazado interno inverso: desde un artículo hacia las calculadoras que lo
 * referencian (la ruta resuelve el mapeo de `related-articles.ts` contra el registry, para que
 * la wiki no dependa de las calculadoras). Complementa los chips de
 * "sigue aprendiendo" que van en sentido calculadora → artículo, cerrando el
 * círculo de enlaces. Degradación elegante: si no hay calculadoras
 * relacionadas, no se renderiza nada.
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
