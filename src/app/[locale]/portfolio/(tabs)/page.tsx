import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { privateMetadata } from "@/shared/seo/seo";

import PortfolioSummaryTab from "@/features/portfolio/components/PortfolioSummaryTab";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "portfolio.tabs" });
  return privateMetadata(t("summaryTitle"));
}

export default async function PortfolioSummaryPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <PortfolioSummaryTab />;
}
