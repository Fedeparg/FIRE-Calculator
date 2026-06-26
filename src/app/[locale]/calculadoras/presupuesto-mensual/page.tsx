import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import CalculatorShell from "@/components/CalculatorShell";
import BudgetCalculator from "@/components/calculators/BudgetCalculator";

type Props = { params: Promise<{ locale: string }> };

export const revalidate = 3600;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "calc.presupuesto-mensual" });
  return { title: t("title"), description: t("intro") };
}

export default async function Page({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("calc.presupuesto-mensual");

  return (
    <CalculatorShell title={t("title")} intro={t("intro")} slug="presupuesto-mensual">
      <BudgetCalculator />
    </CalculatorShell>
  );
}
