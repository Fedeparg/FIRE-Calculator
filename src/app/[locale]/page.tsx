import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { CALCULATORS } from "@/core/registry";
import { CATEGORIES, type CategoryId, type Locale } from "@/core/types";
import { buildMetadata } from "@/lib/seo";
import Hero from "@/components/landing/Hero";
import Pillars from "@/components/landing/Pillars";
import FeatureMcp from "@/components/landing/FeatureMcp";
import Categories, { type LandingCategory } from "@/components/landing/Categories";
import LearnCallout from "@/components/landing/LearnCallout";
import Support from "@/components/landing/Support";
import DisclaimerBanner from "@/components/landing/DisclaimerBanner";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "landing.meta" });
  return buildMetadata({
    locale,
    path: "/",
    title: t("title"),
    description: t("description"),
    // El título de la home ya incluye la marca; no la dupliques con la plantilla.
    titleAbsolute: true,
  });
}

export default async function Landing({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const l = locale as Locale;

  // Categorías reales del registro, con el nº de calculadoras de cada una.
  const usedCategories = [...new Set(CALCULATORS.map((c) => c.category))] as CategoryId[];
  const categories: LandingCategory[] = usedCategories.map((id) => ({
    id,
    label: CATEGORIES[id][l],
    count: CALCULATORS.filter((c) => c.category === id).length,
  }));

  return (
    <>
      <Hero />
      <Pillars />
      <FeatureMcp />
      <Categories categories={categories} />
      <LearnCallout />
      <Support />
      <DisclaimerBanner />
    </>
  );
}
