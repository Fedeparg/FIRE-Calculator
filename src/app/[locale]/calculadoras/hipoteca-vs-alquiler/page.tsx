import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import CalculatorShell from "@/components/CalculatorShell";
import BuyVsRentCalculator from "@/components/calculators/BuyVsRentCalculator";

type Props = { params: Promise<{ locale: string }> };

export const revalidate = 3600;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "calc.hipoteca-vs-alquiler" });
  return { title: t("title"), description: t("intro") };
}

export default async function Page({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("calc.hipoteca-vs-alquiler");

  return (
    <CalculatorShell title={t("title")} intro={t("intro")} slug="hipoteca-vs-alquiler">
      <BuyVsRentCalculator />
    </CalculatorShell>
  );
}
