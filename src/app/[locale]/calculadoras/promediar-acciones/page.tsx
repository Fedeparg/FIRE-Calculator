import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { calculatorMetadata } from "@/lib/seo";
import CalculatorShell from "@/components/CalculatorShell";
import AveragePriceCalculator from "@/components/calculators/AveragePriceCalculator";

type Props = { params: Promise<{ locale: string }> };

export const revalidate = 3600;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "calc.promediar-acciones" });
  return calculatorMetadata({ locale, slug: "promediar-acciones", title: t("title"), description: t("intro") });
}

export default async function Page({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("calc.promediar-acciones");

  return (
    <CalculatorShell title={t("title")} intro={t("intro")} slug="promediar-acciones">
      <AveragePriceCalculator />
    </CalculatorShell>
  );
}
