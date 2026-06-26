import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import CalculatorShell from "@/components/CalculatorShell";
import CompoundCalculator from "@/components/calculators/CompoundCalculator";

type Props = { params: Promise<{ locale: string }> };

// ISR: la calculadora es estática, pero el bloque explicativo de la wiki se lee
// de Markdown en runtime; revalidar permite actualizar ese contenido sin redeploy.
export const revalidate = 3600;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "calc.interes-compuesto" });
  return { title: t("title"), description: t("intro") };
}

export default async function Page({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("calc.interes-compuesto");

  return (
    <CalculatorShell title={t("title")} intro={t("intro")} slug="interes-compuesto">
      <CompoundCalculator />
    </CalculatorShell>
  );
}
