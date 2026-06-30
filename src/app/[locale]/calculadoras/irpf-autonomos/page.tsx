import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { calculatorMetadata } from "@/lib/seo";
import CalculatorShell from "@/components/CalculatorShell";
import SelfEmployedTaxCalculator from "@/components/calculators/SelfEmployedTaxCalculator";

type Props = { params: Promise<{ locale: string }> };

export const revalidate = 3600;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "calc.irpf-autonomos" });
  return calculatorMetadata({ locale, slug: "irpf-autonomos", title: t("title"), description: t("intro") });
}

export default async function Page({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("calc.irpf-autonomos");

  return (
    <CalculatorShell title={t("title")} intro={t("intro")} slug="irpf-autonomos">
      <SelfEmployedTaxCalculator />
    </CalculatorShell>
  );
}
