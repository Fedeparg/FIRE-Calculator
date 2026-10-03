"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import TimeSeriesChart, { type DataRow } from "@/shared/charts/TimeSeriesChart";
import type { ChartTableColumn } from "@/shared/charts/ChartDataTable";
import Notice from "@/shared/ui/Notice";
import { formatIsoDate } from "@/shared/format/format";
import {
  buildHistorySeries,
  withLivePoint,
  DEFAULT_HISTORY_RANGE,
  HISTORY_RANGES,
  type HistoryRangeKey,
} from "@sextante/core/portfolio/history-series";
import type { PortfolioHistoryDto } from "@sextante/core/portfolio/types";
import { signedTone } from "@/shared/format/signed-tone";
import { useFormat } from "@/shared/format/use-format";
import { NO_STORE } from "@/shared/api/client";
import { useApiQuery } from "@/shared/api/use-api-query";
import { useTodayUtc } from "@/shared/ui/use-today-utc";
import { usePortfolioData } from "./PortfolioDataProvider";

type Props = {
  /** Currency chosen in the summary: the series is requested already re-expressed in it. */
  display: string;
};

type Status = "loading" | "ready" | "error";

/**
 * Daily evolution of the portfolio.
 *
 * The series is NOT computed here: it is served by `GET /api/portfolio/history`, which stores one
 * point per day IN EUROS together with that day's FX rates and re-expresses it in the requested
 * currency using the rates of THAT day. That is why changing currency re-requests the series
 * instead of converting the result: converting here at today's rates would count as a gain an
 * exchange-rate move that never happened.
 *
 * While there are fewer than two points (a newly created account has none until tonight's
 * snapshot) no empty chart is drawn: we explain that the series is built daily, which is useful
 * information, unlike a blank canvas.
 */
export default function PortfolioHistoryChart({ display }: Props) {
  const t = useTranslations("portfolio.history");
  const { formatCurrency, formatSignedCurrency, formatSignedPercent } = useFormat();
  const [range, setRange] = useState<HistoryRangeKey>(DEFAULT_HISTORY_RANGE);

  const days = HISTORY_RANGES.find((r) => r.key === range)?.days ?? 365;
  const query = useApiQuery<PortfolioHistoryDto>(
    `/api/portfolio/history?days=${days}&display=${encodeURIComponent(display)}`,
    { init: NO_STORE },
  );
  const history = query.status === "ready" ? query.data : null;
  const status: Status = query.status;

  // Today's snapshot is written overnight: the live valuation (the same as the Summary's) closes
  // the series on today so the chart does not stop at yesterday.
  const { agg } = usePortfolioData();
  const today = useTodayUtc();
  const series = useMemo(() => {
    const live =
      agg.display === display
        ? {
            date: today,
            marketValue: agg.marketValue,
            invested: agg.invested,
            pnlAbs: agg.pnlAbs,
            pnlPct: agg.pnlPct,
            valuedPositions: agg.valued,
            totalPositions: agg.total,
          }
        : null;
    return buildHistorySeries(withLivePoint(history?.points ?? [], live));
  }, [history, agg, display, today]);

  const estimatedColumn: ChartTableColumn<DataRow> = {
    label: t("estimatedColumn"),
    value: (row) => (row.estimated ? t("estimatedYes") : t("estimatedNo")),
  };

  // Last value of the series: on mobile it replaces the Y axis as the scale reference.
  const lastPoint = series.points.at(-1);
  const lastValue = typeof lastPoint?.marketValue === "number" ? lastPoint.marketValue : null;

  const changeColor = signedTone(series.changeAbs);

  return (
    // `min-w-0` + `overflow-hidden`: the box can never be wider than its column, whatever happens
    // inside (on a real iPhone the chart once pushed it off the screen).
    <section className="flex min-w-0 flex-col gap-4 overflow-hidden rounded-2xl border border-border bg-surface p-4 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-foreground">{t("title")}</h2>
        {/* Native select: it takes little space, and on mobile it opens the system picker. */}
        <select
          aria-label={t("rangeLabel")}
          value={range}
          onChange={(event) => {
            const next = HISTORY_RANGES.find(({ key }) => key === event.target.value);
            if (next) setRange(next.key);
          }}
          className="min-h-9 rounded-lg border border-border bg-surface px-2.5 py-1 text-sm text-foreground outline-hidden focus:border-brand focus:ring-2 focus:ring-brand/30"
        >
          {HISTORY_RANGES.map(({ key }) => (
            <option key={key} value={key}>
              {t(`range.${key}`)}
            </option>
          ))}
        </select>
      </div>

      {status === "loading" && <p className="text-sm text-muted">{t("loading")}</p>}

      {status === "error" && <p className="text-sm text-warning">{t("error")}</p>}

      {status === "ready" && series.insufficient && (
        <Notice variant="info">{series.points.length === 0 ? t("emptyBody") : t("singlePointBody")}</Notice>
      )}

      {status === "ready" && !series.insufficient && (
        <>
          {/* The change over the period, on a single line: the amount leads and the date range
              follows. */}
          {lastValue !== null && (
            <p className="text-2xl font-semibold tabular-nums text-foreground">{formatCurrency(lastValue, display)}</p>
          )}
          {series.changeAbs !== null && series.from && series.to && (
            <p className="-mt-3 flex flex-wrap items-baseline gap-x-2 text-sm">
              <span className={`font-semibold tabular-nums ${changeColor}`}>
                {formatSignedCurrency(series.changeAbs, display)}
                {series.changePct !== null && (
                  <span className="ml-1 font-medium">({formatSignedPercent(series.changePct)})</span>
                )}
              </span>
              <span className="text-xs text-muted">
                {t("since", { from: formatIsoDate(series.from), to: formatIsoDate(series.to) })}
              </span>
            </p>
          )}

          <TimeSeriesChart
            title={t("chartTitle")}
            // The block title already says what this is about: the chart's title is kept only for
            // screen readers and the accessible table.
            hideTitle
            // Our own legend (below) explains each series; Recharts' would only repeat the name.
            showLegend={false}
            data={series.points}
            xKey="date"
            valueKey="marketValue"
            // Market value is an area (a single series: nothing to stack) and the
            // cost is a dashed reference line, which is exactly what it is.
            stack={[{ key: "marketValue", name: t("marketValue"), color: "var(--brand)" }]}
            lines={[{ key: "invested", name: t("invested"), color: "var(--accent)" }]}
            xLabel={t("date")}
            currency={display}
            xFormat={(value) => formatIsoDate(String(value))}
            // The X axis is a date, not a continuous magnitude: selecting a range by
            // dragging would make no sense, and the tooltip total would duplicate the only series.
            selectable={false}
            showTotal={false}
            xMinTickGap={48}
            xInterval="preserveStartEnd"
            shadedRanges={series.estimatedRanges.map((range) => ({
              from: range.from,
              to: range.to,
              label: t("estimatedShadeLabel"),
            }))}
            extraColumns={[estimatedColumn]}
            // A high base value with little variation flattens against 0: the axis is fitted
            // to the portfolio's actual range instead of forcing the floor to zero.
            yDomain="fit"
            // On mobile, no Y axis: the value and the change sit on top, and the tooltip gives each day.
            yAxis="fromSm"
          />

          {series.estimatedRanges.length > 0 && (
            <p className="flex items-center gap-2 text-xs text-muted">
              {/* Same ink as the chart's shaded area (`--warning` at 10 %). */}
              <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-sm border border-border bg-warning/10" />
              {t("estimatedNotice")}
            </p>
          )}
          <ul className="flex flex-col gap-1 text-xs text-muted">
            <li className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 shrink-0 rounded-sm"
                style={{ backgroundColor: "var(--brand)" }}
              />
              <span>
                <span className="font-medium text-foreground">{t("marketValue")}</span>: {t("legendMarketValue")}
              </span>
            </li>
            <li className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="h-0 w-2.5 shrink-0 border-t-2 border-dashed"
                style={{ borderColor: "var(--accent)" }}
              />
              <span>
                <span className="font-medium text-foreground">{t("invested")}</span>: {t("legendInvested")}
              </span>
            </li>
          </ul>

          {series.dropped > 0 && <p className="text-xs text-muted">{t("dropped", { count: series.dropped })}</p>}
          <p className="text-xs text-muted">{t("cadence")}</p>
        </>
      )}
    </section>
  );
}
