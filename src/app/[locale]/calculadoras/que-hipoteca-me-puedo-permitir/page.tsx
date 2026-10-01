import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { calculatorMetadata } from "@/lib/seo";
import CalculatorShell from "@/components/CalculatorShell";
import AffordabilityCalculator from "@/components/calculators/AffordabilityCalculator";

type Props = { params: Promise<{ locale: string }> };

export const revalidate = 3600;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "calc.que-hipoteca-me-puedo-permitir" });
  return calculatorMetadata({
    locale,
    slug: "que-hipoteca-me-puedo-permitir",
    title: t("title"),
    description: t("intro"),
  });
}

export default async function Page({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("calc.que-hipoteca-me-puedo-permitir");

  return (
    <CalculatorShell title={t("title")} intro={t("intro")} slug="que-hipoteca-me-puedo-permitir">
      <AffordabilityCalculator />
    </CalculatorShell>
  );
}
