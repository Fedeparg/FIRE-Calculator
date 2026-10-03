import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { CALCULATORS, getUsedCategories } from "@/features/calculators/registry";
import { CATEGORIES } from "@/features/calculators/types";
import { asLocale } from "@/i18n/types";
import { buildMetadata } from "@/shared/seo/seo";
import Hero from "@/features/landing/components/Hero";
import Pillars from "@/features/landing/components/Pillars";
import Categories, { type LandingCategory } from "@/features/landing/components/Categories";
import LearnCallout from "@/features/landing/components/LearnCallout";
import Support from "@/features/landing/components/Support";
import DisclaimerBanner from "@/features/landing/components/DisclaimerBanner";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "landing.meta" });
  return buildMetadata({
    locale,
    path: "/",
    og: { kind: "page", page: "home" },
    title: t("title"),
    description: t("description"),
    // The home title already includes the brand; do not duplicate it through the template.
    titleAbsolute: true,
  });
}

export default async function Landing({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const l = asLocale(locale);

  // Actual registry categories, with the number of calculators in each.
  const categories: LandingCategory[] = getUsedCategories().map((id) => ({
    id,
    label: CATEGORIES[id][l],
    count: CALCULATORS.filter((c) => c.category === id).length,
  }));

  return (
    <>
      <Hero />
      <Pillars />
      <Categories categories={categories} />
      <LearnCallout />
      <Support />
      <DisclaimerBanner />
    </>
  );
}
