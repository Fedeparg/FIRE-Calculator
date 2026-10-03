import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { privateMetadata } from "@/shared/seo/seo";

import PortfolioPositionsTab from "@/features/portfolio/components/PortfolioPositionsTab";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "portfolio.tabs" });
  return privateMetadata(t("positionsTitle"));
}

export default async function PortfolioPositionsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <PortfolioPositionsTab />;
}
