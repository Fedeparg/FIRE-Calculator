import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { calculatorMetadata } from "@/lib/seo";
import CalculatorShell from "@/components/CalculatorShell";
import RetirementCalculator from "@/components/calculators/RetirementCalculator";

type Props = { params: Promise<{ locale: string }> };

export const revalidate = 3600;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "calc.ahorro-jubilacion" });
  return calculatorMetadata({ locale, slug: "ahorro-jubilacion", title: t("title"), description: t("intro") });
}

export default async function Page({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("calc.ahorro-jubilacion");

  return (
    <CalculatorShell title={t("title")} intro={t("intro")} slug="ahorro-jubilacion">
      <RetirementCalculator />
    </CalculatorShell>
  );
}
