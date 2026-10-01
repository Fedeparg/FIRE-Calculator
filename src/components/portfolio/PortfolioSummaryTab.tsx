"use client";

import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import PortfolioBreakdown from "./PortfolioBreakdown";
import { usePortfolioData } from "./PortfolioDataProvider";
import PortfolioHistoryChart from "./PortfolioHistoryChart";
import PortfolioSummary from "./PortfolioSummary";

/** Pestaña Resumen: cómo va la cartera, sin tabla ni formularios. */
export default function PortfolioSummaryTab() {
  const t = useTranslations("portfolio");
  const { positions, prices, rates, display, agg, fxAsOf, pricesFetchedAt, pricesCheckedAt } =
    usePortfolioData();

  if (positions.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-8 text-center">
        <p className="text-foreground">{t("empty.title")}</p>
        <p className="mt-1 text-sm text-muted">{t("empty.body")}</p>
        <Link
          href="/portfolio/posiciones"
          className="mt-4 inline-block text-sm font-medium text-brand underline underline-offset-2"
        >
          {t("tabs.addFirst")}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PortfolioSummary
        agg={agg}
        fxAsOf={fxAsOf}
        pricesFetchedAt={pricesFetchedAt}
        pricesCheckedAt={pricesCheckedAt}
        display={display}
      />
      <PortfolioHistoryChart display={display} />
      <PortfolioBreakdown
        positions={positions.filter((p) => !p.isDerivative && p.quantity > 0)}
        prices={prices}
        rates={rates}
        display={display}
      />
    </div>
  );
}
