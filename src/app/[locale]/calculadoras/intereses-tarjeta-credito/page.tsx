import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import CalculatorShell from "@/components/CalculatorShell";
import CreditCardCalculator from "@/components/calculators/CreditCardCalculator";

type Props = { params: Promise<{ locale: string }> };

export const revalidate = 3600;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "calc.tarjeta-credito" });
  return { title: t("title"), description: t("intro") };
}

export default async function Page({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("calc.tarjeta-credito");

  return (
    <CalculatorShell title={t("title")} intro={t("intro")} slug="intereses-tarjeta-credito">
      <CreditCardCalculator />
    </CalculatorShell>
  );
}
