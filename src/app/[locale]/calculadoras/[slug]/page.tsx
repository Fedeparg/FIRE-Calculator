import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CALCULATORS } from "@/core/registry";
import { calculatorMetadata } from "@/lib/seo";
import CalculatorShell from "@/components/CalculatorShell";
import CalculatorBody from "@/components/calculators/CalculatorBody";

type Props = { params: Promise<{ locale: string; slug: string }> };

const SLUGS = CALCULATORS.map((c) => c.slug);

// ISR: la calculadora es estática, pero el explainer de la wiki se lee de Markdown en runtime;
// revalidar permite actualizarlo sin redeploy.
export const revalidate = 3600;

// Solo existen las calculadoras del registry: cualquier otro slug es un 404, no un render bajo demanda.
export const dynamicParams = false;

export function generateStaticParams() {
  return SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const t = await getTranslations({ locale, namespace: `calc.${slug}` });
  return calculatorMetadata({ locale, slug, title: t("title"), description: t("intro") });
}

export default async function Page({ params }: Props) {
  const { locale, slug } = await params;
  if (!SLUGS.includes(slug)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations(`calc.${slug}`);

  return (
    <CalculatorShell title={t("title")} intro={t("intro")} slug={slug}>
      <CalculatorBody slug={slug} />
    </CalculatorShell>
  );
}
