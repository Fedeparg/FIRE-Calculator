import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import CalculatorShell from "@/components/CalculatorShell";
import NetSalaryCalculator from "@/components/calculators/NetSalaryCalculator";

type Props = { params: Promise<{ locale: string }> };

export const revalidate = 3600;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "calc.salario-bruto-neto" });
  return { title: t("title"), description: t("intro") };
}

export default async function Page({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("calc.salario-bruto-neto");

  return (
    <CalculatorShell title={t("title")} intro={t("intro")} slug="salario-bruto-neto">
      <NetSalaryCalculator />
    </CalculatorShell>
  );
}
