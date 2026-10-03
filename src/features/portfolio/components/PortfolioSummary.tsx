"use client";

import { useLocale, useTranslations } from "next-intl";

import type { PortfolioAggregate } from "@sextante/core/portfolio/aggregate";
import { formatIsoDate, formatRelativeTime } from "@/shared/format/format";
import { gainSince } from "@sextante/core/portfolio/history-series";
import type { PortfolioHistoryDto } from "@sextante/core/portfolio/types";
import { asLocale } from "@/i18n/types";
import { signedTone } from "@/shared/format/signed-tone";
import { useFormat } from "@/shared/format/use-format";
import { historyPath } from "@/features/portfolio/api";
import { NO_STORE } from "@/shared/api/client";
import { useApiQuery } from "@/shared/api/use-api-query";
import { useTodayUtc } from "@/shared/ui/use-today-utc";
import { daysBetween, yearOf } from "@sextante/core/dates";

type Props = {
  /** Aggregated total (computed by the data provider, the same for every tab). */
  agg: PortfolioAggregate;
  /** Date of the FX rates used, or null if there are none yet. */
  fxAsOf: string | null;
  /** ISO instant of the most recent price read, or null if unknown. */
  pricesFetchedAt: string | null;
  /** When the screen received those prices (ms): the "now" for the relative time. */
  pricesCheckedAt: number | null;
  display: string;
};

/** January 1st of `today`'s year and the days elapsed since then, today included. */
function startOfYear(today: string): { from: string; days: number } {
  const from = `${yearOf(today)}-01-01`;
  return { from, days: daysBetween(from, today) + 1 };
}

/**
 * Summary header: what the portfolio is worth today and how much it gains, with the amount
 * invested and the year-to-date gain beside it. Only positions with a price convertible to the
 * chosen currency count; the rest are excluded and called out, so the total is not inflated with
 * conversions we cannot perform.
 */
export default function PortfolioSummary({ agg, fxAsOf, pricesFetchedAt, pricesCheckedAt, display }: Props) {
  const t = useTranslations("portfolio.summary");
  const locale = asLocale(useLocale());
  const { formatCurrency, formatSignedCurrency, formatSignedPercent } = useFormat();

  // The year-to-date gain comes from the daily history: only the current year is requested. It is
  // supporting data: without history (error or still loading) it simply is not shown.
  const { from, days } = startOfYear(useTodayUtc());
  const history = useApiQuery<PortfolioHistoryDto>(historyPath(days, display), { init: NO_STORE });
  const gain = history.status === "ready" ? gainSince(history.data.points, from) : null;

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

  return (
    <section className="flex min-w-0 flex-col gap-5 rounded-2xl border border-border bg-surface p-5 sm:p-7 lg:flex-row lg:items-end lg:justify-between">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm text-muted">{t("marketValue")}</h2>
        <p className="text-4xl font-semibold tracking-tight text-foreground tabular-nums sm:text-5xl">
          {formatCurrency(agg.marketValue, display)}
        </p>
        <p className={`text-sm font-medium tabular-nums ${signedTone(agg.pnlAbs)}`}>
          {agg.pnlPct === null
            ? t("sincePurchaseAmount", { amount: formatSignedCurrency(agg.pnlAbs, display) })
            : t("sincePurchase", {
                amount: formatSignedCurrency(agg.pnlAbs, display),
                percent: formatSignedPercent(agg.pnlPct, { minDecimals: 2 }),
              })}
        </p>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-10">
        <dl className="flex flex-wrap gap-x-8 gap-y-4">
          <div className="flex flex-col gap-1">
            <dt className="text-sm text-muted">{t("invested")}</dt>
            <dd className="text-xl font-semibold tabular-nums text-foreground">
              {formatCurrency(agg.invested, display)}
            </dd>
          </div>
          {gain && (
            <div className="flex flex-col gap-1">
              <dt className="text-sm text-muted">
                {gain.since.endsWith("-01-01")
                  ? t("thisYear")
                  : t("thisYearSince", { date: formatIsoDate(gain.since) })}
              </dt>
              <dd className={`text-xl font-semibold tabular-nums ${signedTone(gain.gain)}`}>
                {formatSignedCurrency(gain.gain, display)}
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
