import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CALCULATORS } from "@/core/registry";
import { CATEGORIES, type CategoryId, type Locale } from "@/core/types";
import Selector, { type SelectorItem } from "@/components/Selector";
import AdSlot from "@/components/AdSlot";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "selector" });
  return { title: t("heading"), description: t("subheading") };
}

export default async function CalculatorsIndex({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const l = locale as Locale;
  const t = await getTranslations("selector");

  const items: SelectorItem[] = CALCULATORS.map((c) => ({
    slug: c.slug,
    name: c.name[l],
    description: c.description[l],
    category: c.category,
    status: c.status,
    search: [c.name[l], c.description[l], ...c.keywords].join(" "),
  }));

  const usedCategories = [...new Set(CALCULATORS.map((c) => c.category))] as CategoryId[];
  const categories = usedCategories.map((id) => ({ id, label: CATEGORIES[id][l] }));

  return (
    <section className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
        {t("heading")}
      </h1>
      <p className="mt-3 max-w-2xl text-muted">{t("subheading")}</p>
      <Selector items={items} categories={categories} />
      <AdSlot className="mt-10" />
    </section>
  );
}
