import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CALCULATORS, getUsedCategories } from "@/features/calculators/registry";
import { CATEGORIES } from "@/features/calculators/types";
import { asLocale } from "@/i18n/types";
import { buildMetadata } from "@/shared/seo/seo";
import Selector, { type SelectorItem } from "@/features/calculators/components/Selector";
import RouteMessages from "@/i18n/RouteMessages";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "selector" });
  return buildMetadata({
    locale,
    path: "/calculadoras",
    og: { kind: "page", page: "calculators" },
    title: t("heading"),
    description: t("subheading"),
  });
}

export default async function CalculatorsIndex({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const l = asLocale(locale);
  const t = await getTranslations("selector");
  const tCatalog = await getTranslations("catalog");

  const items: SelectorItem[] = CALCULATORS.map((c) => {
    const name = tCatalog(`${c.slug}.name`);
    const description = tCatalog(`${c.slug}.description`);
    return {
      slug: c.slug,
      name,
      description,
      category: c.category,
      search: [name, description, ...c.keywords].join(" "),
    };
  });

  const categories = getUsedCategories().map((id) => ({ id, label: CATEGORIES[id][l] }));

  return (
    <RouteMessages route="calculadoras">
      <section className="mx-auto max-w-5xl px-4 py-10">
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{t("heading")}</h1>
        <p className="mt-3 max-w-2xl text-muted">{t("subheading")}</p>
        <Selector items={items} categories={categories} />
      </section>
    </RouteMessages>
  );
}
