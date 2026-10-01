import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import PortfolioPositionsTab from "@/components/portfolio/PortfolioPositionsTab";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "portfolio.tabs" });
  // Página privada: nada que indexar.
  return { title: t("positionsTitle"), robots: { index: false, follow: false } };
}

export default async function PortfolioPositionsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <PortfolioPositionsTab />;
}
