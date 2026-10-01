"use client";

import { useLocale, useTranslations } from "next-intl";

import type { PortfolioAggregate } from "@sextante/core/fx";
import { formatIsoDate, formatRelativeTime } from "@/core/format";
import { asLocale } from "@/core/types";
import { useFormat } from "@/lib/format";

type Props = {
  /**
   * Total agregado ya calculado. Lo calcula el padre porque lo comparten el resumen y el
   * bloque de objetivo: dos agregaciones independientes podrían enseñar dos totales.
   */
  agg: PortfolioAggregate;
  /** Fecha de las tasas FX usadas, o null si aún no hay. */
  fxAsOf: string | null;
  /** Instante ISO de la lectura de precios más reciente, o null si no se sabe. */
  pricesFetchedAt: string | null;
  /** Cuándo recibió la pantalla esos precios (ms): el "ahora" del tiempo relativo. */
  pricesCheckedAt: number | null;
  /**
   * Divisa elegida. La gobierna el padre —junto con su selector— porque la comparten el
   * objetivo, el histórico y la composición.
   */
  display: string;
};

/**
 * Total agregado de la cartera en una divisa elegida por el usuario (el único sitio donde
 * SÍ convertimos divisas, vía las tasas FX de nuestra DB). Solo entran las posiciones con
 * precio en su propia divisa y convertible al destino; el resto se excluye y se señala,
 * para no inflar el total con conversiones que no podemos hacer.
 */
export default function PortfolioSummary({
  agg,
  fxAsOf,
  pricesFetchedAt,
  pricesCheckedAt,
  display,
}: Props) {
  const t = useTranslations("portfolio.summary");
  const locale = asLocale(useLocale());
  const { formatCurrency, formatPercent } = useFormat();

  const excluded = agg.total - agg.valued;
  const sign = agg.pnlAbs > 0 ? "+" : "";
  const pnlColor =
    agg.pnlAbs > 0 ? "text-success" : agg.pnlAbs < 0 ? "text-danger" : "text-foreground";

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-6">
      <h2 className="text-lg font-semibold text-foreground">{t("title")}</h2>

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
                    {formatPercent(agg.pnlPct, { minDecimals: 2 })})
                  </span>
                )}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-1 text-xs text-muted">
            {excluded > 0 && <p>{t("excluded", { count: excluded, total: agg.total })}</p>}
            {pricesFetchedAt && pricesCheckedAt !== null && (
              <p>
                {t("pricesUpdated", {
                  ago: formatRelativeTime(pricesFetchedAt, pricesCheckedAt, locale),
                })}
              </p>
            )}
            {fxAsOf && <p>{t("fxAsOf", { date: formatIsoDate(fxAsOf) })}</p>}
            <p>{t("priceCadence")}</p>
          </div>
        </>
      )}
    </div>
  );
}
