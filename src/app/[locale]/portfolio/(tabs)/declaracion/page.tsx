import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { privateMetadata } from "@/shared/seo/seo";

import { fetchRealisedGainsData } from "@/features/portfolio/api.server";
import Notice from "@/shared/ui/Notice";
import { Link } from "@/i18n/navigation";
import RealisedGainsReport from "@/features/portfolio/components/RealisedGainsReport";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "portfolio.taxReturn" });
  return privateMetadata(t("title"));
}

/**
 * Tax return (Declaración) tab: the income tax (Renta) report for the savings base. It fetches its
 * own data (positions WITH lots, income, carried-forward balances and ECB rates) instead of using
 * the layout's: the report needs the full history, which the other tabs do not.
 * The layout already checks the session.
 */
export default async function TaxReturnPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("portfolio.taxReturn");
  const data = await fetchRealisedGainsData();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold text-foreground">{t("title")}</h2>
        <p className="text-sm text-muted">
          {t("subtitle")}{" "}
          <Link
            href="/aprende/declarar-broker-extranjero"
            className="font-medium text-brand underline underline-offset-2"
          >
            {t("learnMore")}
          </Link>
        </p>
      </div>
      {data ? (
        <RealisedGainsReport
          positions={data.positions}
          income={data.income}
          pendingBalances={data.pendingBalances}
          assetClasses={data.assetClasses}
          rates={data.rates}
          ratesLoaded={data.ratesLoaded}
        />
      ) : (
        <Notice variant="warning">{t("loadError")}</Notice>
      )}
    </div>
  );
}
