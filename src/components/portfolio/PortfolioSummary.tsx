"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { aggregatePortfolio } from "@/core/fx";
import { formatIsoDate } from "@/core/format";
import { useFormat } from "@/lib/format";
import {
  PORTFOLIO_CURRENCIES,
  type FxRates,
  type PriceInfo,
  type Position,
} from "@/lib/portfolio";

type Props = {
  positions: Position[];
  prices: Record<string, PriceInfo>;
  /** Tasas FX desde la API; null mientras cargan o si no hay datos. */
  fxRates: FxRates | null;
};

/**
 * Total agregado de la cartera en una divisa elegida por el usuario (el único sitio donde
 * SÍ convertimos divisas, vía las tasas FX de nuestra DB). Solo entran las posiciones con
 * precio en su propia divisa y convertible al destino; el resto se excluye y se señala,
 * para no inflar el total con conversiones que no podemos hacer.
 */
export default function PortfolioSummary({ positions, prices, fxRates }: Props) {
  const t = useTranslations("portfolio.summary");
  const { currencyLabel, formatCurrency, formatPercent } = useFormat();
  const [display, setDisplay] = useState<string>("EUR");

  const rates = useMemo(() => fxRates?.rates ?? {}, [fxRates]);
  const agg = useMemo(
    () => aggregatePortfolio({ positions, prices, rates, display }),
    [positions, prices, rates, display],
  );

  const excluded = agg.total - agg.valued;
  const sign = agg.pnlAbs > 0 ? "+" : "";
  const pnlColor =
    agg.pnlAbs > 0 ? "text-success" : agg.pnlAbs < 0 ? "text-danger" : "text-foreground";

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-foreground">{t("title")}</h2>
        <label className="flex items-center gap-2 text-sm text-muted">
          {t("displayIn")}
          <select
            value={display}
            onChange={(e) => setDisplay(e.target.value)}
            className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
          >
            {PORTFOLIO_CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {currencyLabel(c)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {agg.valued === 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted">{t("noData")}</p>
          <p className="text-xs text-muted">{t("priceCadence")}</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1">
              <span className="text-sm text-muted">{t("invested")}</span>
              <span className="text-xl font-semibold tabular-nums text-foreground">
                {formatCurrency(agg.invested, display)}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-sm text-muted">{t("marketValue")}</span>
              <span className="text-xl font-semibold tabular-nums text-foreground">
                {formatCurrency(agg.marketValue, display)}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-sm text-muted">{t("pnl")}</span>
              <span className={`text-xl font-semibold tabular-nums ${pnlColor}`}>
                {sign}
                {formatCurrency(agg.pnlAbs, display)}
                {agg.pnlPct !== null && (
                  <span className="ml-1 text-base font-medium">
                    ({sign}
                    {formatPercent(agg.pnlPct)})
                  </span>
                )}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-1 text-xs text-muted">
            {excluded > 0 && <p>{t("excluded", { count: excluded, total: agg.total })}</p>}
            {fxRates?.asOf && <p>{t("fxAsOf", { date: formatIsoDate(fxRates.asOf) })}</p>}
            <p>{t("priceCadence")}</p>
          </div>
        </>
      )}
    </div>
  );
}
