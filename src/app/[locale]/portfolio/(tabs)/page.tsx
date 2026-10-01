import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import PortfolioSummaryTab from "@/components/portfolio/PortfolioSummaryTab";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "portfolio.tabs" });
  // Página privada: nada que indexar.
  return { title: t("summaryTitle"), robots: { index: false, follow: false } };
}

export default async function PortfolioSummaryPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <PortfolioSummaryTab />;
}
