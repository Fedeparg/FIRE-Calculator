"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import type { PortfolioAggregate } from "@sextante/core/fx";
import { formatIsoDate, formatRelativeTime } from "@/core/format";
import { gainSince, type PeriodGain, type PortfolioHistoryDto } from "@/core/portfolio-history";
import { asLocale } from "@/core/types";
import { useFormat } from "@/lib/format";

type Props = {
  /** Total agregado (lo calcula el proveedor de datos, el mismo para todas las pestañas). */
  agg: PortfolioAggregate;
  /** Fecha de las tasas FX usadas, o null si aún no hay. */
  fxAsOf: string | null;
  /** Instante ISO de la lectura de precios más reciente, o null si no se sabe. */
  pricesFetchedAt: string | null;
  /** Cuándo recibió la pantalla esos precios (ms): el "ahora" del tiempo relativo. */
  pricesCheckedAt: number | null;
  display: string;
};

/** 1 de enero del año en curso (UTC) y los días que han pasado desde entonces, hoy incluido. */
function startOfYear(now: Date): { from: string; days: number } {
  const from = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const days = Math.floor((now.getTime() - from.getTime()) / 86_400_000) + 1;
  return { from: from.toISOString().slice(0, 10), days };
}

/** Clase de color de una ganancia o pérdida. */
function pnlClass(value: number): string {
  return value > 0 ? "text-success" : value < 0 ? "text-danger" : "text-foreground";
}

/**
 * Cabecera del Resumen: lo que vale hoy la cartera y cuánto gana, con lo invertido y la ganancia
 * del año al lado. Solo entran las posiciones con precio convertible a la divisa elegida; el
 * resto se excluye y se dice, para no inflar el total con conversiones que no podemos hacer.
 */
export default function PortfolioSummary({ agg, fxAsOf, pricesFetchedAt, pricesCheckedAt, display }: Props) {
  const t = useTranslations("portfolio.summary");
  const locale = asLocale(useLocale());
  const { formatCurrency, formatPercent } = useFormat();
  const [yearGain, setYearGain] = useState<{ display: string; gain: PeriodGain | null } | null>(null);

  // La ganancia del año sale del histórico diario. Se pide solo lo que va de año.
  useEffect(() => {
    let cancelled = false;
    const { from, days } = startOfYear(new Date());
    const load = async () => {
      try {
        const res = await fetch(
          `/api/portfolio/history?days=${days}&display=${encodeURIComponent(display)}`,
          { cache: "no-store" },
        );
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as PortfolioHistoryDto;
        if (!cancelled) setYearGain({ display, gain: gainSince(data.points, from) });
      } catch {
        // Es un dato de apoyo: sin histórico, simplemente no se enseña.
        if (!cancelled) setYearGain({ display, gain: null });
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [display]);

  if (agg.valued === 0) {
    return (
      <section className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-6">
        <h2 className="text-sm text-muted">{t("marketValue")}</h2>
        <p className="text-sm text-muted">{t("noData")}</p>
        <p className="text-xs text-muted">{t("priceCadence")}</p>
      </section>
    );
  }

  const excluded = agg.total - agg.valued;
  const sign = agg.pnlAbs > 0 ? "+" : "";
  // La del año solo se enseña si corresponde a la divisa que se está viendo.
  const gain = yearGain?.display === display ? yearGain.gain : null;

  return (
    <section className="flex flex-col gap-5 rounded-2xl border border-border bg-surface p-6 sm:p-7 lg:flex-row lg:items-end lg:justify-between">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm text-muted">{t("marketValue")}</h2>
        <p className="text-4xl font-semibold tracking-tight text-foreground tabular-nums sm:text-5xl">
          {formatCurrency(agg.marketValue, display)}
        </p>
        <p className={`text-sm font-medium tabular-nums ${pnlClass(agg.pnlAbs)}`}>
          {agg.pnlPct === null
            ? t("sincePurchaseAmount", { amount: `${sign}${formatCurrency(agg.pnlAbs, display)}` })
            : t("sincePurchase", {
                amount: `${sign}${formatCurrency(agg.pnlAbs, display)}`,
                percent: `${sign}${formatPercent(agg.pnlPct, { minDecimals: 2 })}`,
              })}
        </p>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-10">
        <dl className="flex gap-8">
          <div className="flex flex-col gap-1">
            <dt className="text-sm text-muted">{t("invested")}</dt>
            <dd className="text-xl font-semibold tabular-nums text-foreground">
              {formatCurrency(agg.invested, display)}
            </dd>
          </div>
          {gain && (
            <div className="flex flex-col gap-1">
              <dt className="text-sm text-muted">
                {gain.since.endsWith("-01-01") ? t("thisYear") : t("thisYearSince", { date: formatIsoDate(gain.since) })}
              </dt>
              <dd className={`text-xl font-semibold tabular-nums ${pnlClass(gain.gain)}`}>
                {gain.gain > 0 ? "+" : ""}
                {formatCurrency(gain.gain, display)}
                {gain.estimated && <span className="sr-only"> {t("thisYearEstimated")}</span>}
              </dd>
            </div>
          )}
        </dl>
        <div className="flex max-w-56 flex-col gap-0.5 text-xs text-muted">
          {pricesFetchedAt && pricesCheckedAt !== null && (
            <p>{t("pricesUpdated", { ago: formatRelativeTime(pricesFetchedAt, pricesCheckedAt, locale) })}</p>
          )}
          {fxAsOf && <p>{t("fxAsOf", { date: formatIsoDate(fxAsOf) })}</p>}
          {gain?.estimated && <p>{t("thisYearEstimated")}</p>}
          {excluded > 0 && <p>{t("excluded", { count: excluded, total: agg.total })}</p>}
        </div>
      </div>
    </section>
  );
}
