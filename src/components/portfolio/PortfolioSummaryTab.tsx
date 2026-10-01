"use client";

import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import PortfolioBreakdown from "./PortfolioBreakdown";
import { usePortfolioData } from "./PortfolioDataProvider";
import PortfolioGoalCard from "./PortfolioGoalCard";
import PortfolioHistoryChart from "./PortfolioHistoryChart";
import PortfolioMovers from "./PortfolioMovers";
import PortfolioSummary from "./PortfolioSummary";

/** Pestaña Resumen: cómo va la cartera, sin tabla ni formularios. */
export default function PortfolioSummaryTab() {
  const t = useTranslations("portfolio");
  const { positions, prices, rates, display, agg, fxAsOf, pricesFetchedAt, pricesCheckedAt } = usePortfolioData();

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
      {/* `grid-cols-1` (minmax(0, 1fr)) y no la columna implícita `auto`: esa crece hasta el
          ancho intrínseco de la gráfica, y en WebKit (todo navegador de iOS) la caja se salía
          de la pantalla. */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <PortfolioHistoryChart display={display} />
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <PortfolioGoalCard marketValue={agg.marketValue} display={display} rates={rates} />
          <PortfolioBreakdown
            positions={positions.filter((p) => !p.isDerivative && p.quantity > 0)}
            prices={prices}
            rates={rates}
            display={display}
          />
        </div>
      </div>
      <PortfolioMovers positions={positions} prices={prices} />
    </div>
  );
}
