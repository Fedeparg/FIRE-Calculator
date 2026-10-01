import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { fetchPositionsWithLots } from "@/lib/portfolio.server";
import Notice from "@/components/ui/Notice";
import { Link } from "@/i18n/navigation";
import RealisedGainsReport from "@/components/portfolio/RealisedGainsReport";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "portfolio.realisedGains" });
  // Página privada: nada que indexar.
  return { title: t("title"), robots: { index: false, follow: false } };
}

/**
 * Pestaña Plusvalías. Pide sus propios datos (posiciones CON lotes) en vez de usar los del
 * layout: el informe necesita todo el histórico de operaciones, que el resto de pestañas no.
 * La sesión ya la comprueba el layout.
 */
export default async function RealisedGainsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("portfolio.realisedGains");
  const data = await fetchPositionsWithLots();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold text-foreground">{t("title")}</h2>
        <p className="text-sm text-muted">
          {t("subtitle")}{" "}
          <Link
            href="/aprende/plusvalias-al-vender"
            className="font-medium text-brand underline underline-offset-2"
          >
            {t("learnMore")}
          </Link>
        </p>
      </div>
      {data ? (
        <RealisedGainsReport positions={data.positions} lots={data.lots} />
      ) : (
        <Notice variant="warning">{t("loadError")}</Notice>
      )}
    </div>
  );
}
