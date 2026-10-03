"use client";

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useTranslations } from "next-intl";
import { useFormat } from "@/shared/format/use-format";
import { useMediaQuery } from "@/shared/ui/use-media-query";
import ChartDataTable, { type ChartTableColumn } from "./ChartDataTable";
import ChartTooltip from "./ChartTooltip";
import { fitYDomain } from "./fit-y-domain";
import { useRangeSelection } from "./use-range-selection";

/**
 * Key of a data row `T`: series, bands and axes refer to columns that really exist in the point
 * type (a typo such as `"valu"` does not compile).
 */
type DataKey<T> = keyof T & string;

export type SeriesDef<T> = {
  key: DataKey<T>;
  name: string;
  color: string;
  /** `lines` only: dashed (default) or solid stroke. */
  dashed?: boolean;
};

/**
 * Band between two series (e.g. the 10th and 90th percentiles of a simulation). Drawn as a
 * filled area between `lowKey` and `highKey`, not stacked on the rest.
 */
export type BandDef<T> = { lowKey: DataKey<T>; highKey: DataKey<T>; name: string; color: string };

/**
 * Generic data row, for callers that build their points on the fly (the portfolio). The X axis
 * accepts text (an ISO date) as well as numbers; `boolean` is allowed for extra columns of the
 * accessible table (e.g. "estimated") that are not drawn on the chart itself. The calculators
 * pass their point types from core, without an index signature.
 */
export type DataRow = Record<string, number | string | boolean>;

type Props<T extends object> = {
  title: string;
  data: readonly T[];
  xKey: DataKey<T>;
  /** Stacked series (e.g. contributions + interest). */
  stack: readonly SeriesDef<T>[];
  /** Optional overlaid lines (e.g. the FIRE target). */
  lines?: readonly SeriesDef<T>[];
  /** Optional bands between two series (e.g. a percentile fan). */
  bands?: readonly BandDef<T>[];
  valueKey: DataKey<T>;
  contributedKey?: DataKey<T>;
  interestKey?: DataKey<T>;
  /** X-axis name (accessible table header and tooltip prefix). Defaults to "Year". */
  xLabel?: string;
  height?: number;
  /**
   * Currency of the amounts. If omitted, amounts are formatted in euros exactly as before
   * (`formatEUR` / `formatCompactEUR`): the calculators are unchanged. The portfolio passes it to
   * draw the series in the currency the user picked.
   */
  currency?: string;
  /**
   * Format of the X-axis value (ticks, tooltip and accessible table). Defaults to an integer,
   * which is what a year axis needs.
   */
  xFormat?: (value: string | number) => string;
  /**
   * Drag selection to see the growth over a range. Only meaningful with a numeric, continuous X
   * axis (years); disabled for dates.
   */
  selectable?: boolean;
  /** "Total" row in the tooltip. Redundant with a single stacked series. */
  showTotal?: boolean;
  /**
   * Minimum gap between X-axis labels, in pixels. The default is Recharts' own; a daily series
   * needs much more to avoid overlap.
   */
  xMinTickGap?: number;
  /**
   * X-axis label strategy. The default is Recharts'; `preserveStartEnd` guarantees the ends
   * when intermediate labels are hidden.
   */
  xInterval?: "preserveEnd" | "preserveStartEnd";
  /**
   * X-axis ranges shaded permanently (unlike the drag selection, which is interactive). Generic
   * on purpose — the component does not know what a range means, it just draws it — so any
   * calculator can reuse it; today the portfolio uses it to mark the history's `estimated`
   * points.
   */
  shadedRanges?: readonly { from: string | number; to: string | number; label?: string }[];
  /**
   * Extra columns for the accessible table, besides the X axis and the series (`stack`/`lines`).
   * Like `shadedRanges`, it keeps the component agnostic of what the data means.
   */
  extraColumns?: readonly ChartTableColumn<T>[];
  /**
   * Value-axis domain. `"zero"` (default) is the original one: it starts at 0, which is right
   * for a projection that grows from zero. `"fit"` fits the axis to the actual data range (with
   * a 1% margin above and below) instead of forcing 0 as the floor; the portfolio needs it, as a
   * high base value with little variation looks flat against 0.
   */
  yDomain?: "zero" | "fit";
  /**
   * Hides the title visually (it stays in the DOM for screen readers and names the accessible
   * table). For when the enclosing block already states it.
   */
  hideTitle?: boolean;
  /** Draws the Recharts legend. Turned off when the caller renders its own, more descriptive one. */
  showLegend?: boolean;
  /**
   * `fromSm`: no axes below `sm`. On a phone the axes eat up the width; the caller shows the
   * value and the date range above, and the tooltip gives each exact point.
   */
  yAxis?: "always" | "fromSm";
};

// Defaults for optional props as module constants: a `= []` in the signature creates a new array
// on every render, and the `useMemo`s depending on it would always recompute. A frozen empty
// array works for any `T`.
const NO_ITEMS: readonly never[] = Object.freeze([]);

/**
 * Row type used to instantiate the Recharts components that take a key as text. Their
 * `TypedDataKey<T>` is a conditional type TypeScript cannot resolve while `T` is generic; the key
 * is already checked against `T` in this component's props.
 */
type RechartsRow = Record<string, unknown>;

const toNum = (v: unknown) => (v === undefined ? 0 : Number(v));

/** X-axis value of a row: a number (years) or text (ISO date). */
function xValueOf(value: unknown): string | number {
  return typeof value === "number" || typeof value === "string" ? value : String(value);
}

export default function TimeSeriesChart<T extends object>({
  title,
  data,
  xKey,
  stack,
  lines = NO_ITEMS,
  bands = NO_ITEMS,
  valueKey,
  contributedKey,
  interestKey,
  xLabel,
  height = 300,
  currency,
  xFormat,
  selectable = true,
  showTotal = true,
  xMinTickGap = 5,
  xInterval = "preserveEnd",
  shadedRanges = NO_ITEMS,
  extraColumns = NO_ITEMS,
  yDomain = "zero",
  hideTitle = false,
  showLegend = true,
  yAxis = "always",
}: Props<T>) {
  const isSmUp = useMediaQuery("(min-width: 640px)", true);
  const showYAxis = yAxis === "always" || isSmUp;
  const { formatCompactCurrency, formatCompactEUR, formatCurrency, formatEUR, formatNumber } = useFormat();
  // Without `currency` the format is EXACTLY the previous one; with a currency it defers to `Intl`.
  const formatValue = currency ? (n: number) => formatCurrency(n, currency) : formatEUR;
  // Non-breaking spaces: Recharts splits axis labels at regular spaces when they do not fit,
  // and on mobile "600 mil €" ended up on two lines.
  const formatAxisValue = (n: number) =>
    (currency ? formatCompactCurrency(n, currency) : formatCompactEUR(n)).replace(/ /g, "\u00a0");
  const formatX = xFormat ?? ((value: string | number) => formatNumber(Number(value)));
  // The labels (total, selection, accessibility) are generic to any chart, so they are read from
  // the shared `chart` namespace instead of being repeated in every calculator.
  const tc = useTranslations("chart");
  const axisX = xLabel ?? tc("axisYear");
  // The range is shown with the same format as the axis (without `xFormat`, as is: years).
  const formatRangeX = xFormat ?? String;
  const { selection, handlers: selectionHandlers } = useRangeSelection(selectable);

  // With `yDomain="fit"` the axis fits the actual data range (see `fitYDomain`).
  const fittedYDomain = useMemo(
    () =>
      yDomain === "fit"
        ? fitYDomain(
            data,
            stack.map((s) => s.key),
            [...lines.map((l) => l.key), ...bands.flatMap((b) => [b.lowKey, b.highKey])],
          )
        : undefined,
    [data, stack, lines, bands, yDomain],
  );

  const totalKeys = stack.map((s) => s.key);

  function pointAt(x: number): T | undefined {
    return data.find((d) => xValueOf(d[xKey]) === x);
  }

  const summary = (() => {
    if (!selectable || !selection) return null;
    const a = Math.min(selection.start, selection.end);
    const b = Math.max(selection.start, selection.end);
    const pa = pointAt(a);
    const pb = pointAt(b);
    if (!pa || !pb || a === b) return null;
    return {
      from: a,
      to: b,
      growth: toNum(pb[valueKey]) - toNum(pa[valueKey]),
      contributed: contributedKey ? toNum(pb[contributedKey]) - toNum(pa[contributedKey]) : null,
      interest: interestKey ? toNum(pb[interestKey]) - toNum(pa[interestKey]) : null,
    };
  })();

  const tableColumns: ChartTableColumn<T>[] = [
    { label: axisX, value: (row) => formatX(xValueOf(row[xKey])) },
    ...[...stack, ...lines].map((series) => ({
      label: series.name,
      value: (row: T) => formatValue(Number(row[series.key])),
    })),
    ...bands.map((band) => ({
      label: band.name,
      value: (row: T) => `${formatValue(Number(row[band.lowKey]))} – ${formatValue(Number(row[band.highKey]))}`,
    })),
    ...extraColumns,
  ];

  return (
    // Without a Y axis (compact mobile) the chart already lives inside the caller's card: no
    // second box, to use the full width.
    <div
      className={
        showYAxis
          ? "rounded-xl border border-border bg-surface p-4"
          : "sm:rounded-xl sm:border sm:border-border sm:bg-surface sm:p-4"
      }
    >
      <div className={`flex items-center justify-between gap-3 ${hideTitle && !summary ? "" : "mb-3 min-h-[20px]"}`}>
        <h2 className={hideTitle ? "sr-only" : "text-sm font-medium text-foreground"}>{title}</h2>
        {summary && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
            <span className="text-muted">
              {tc("selectionTitle")} ({formatRangeX(summary.from)}–{formatRangeX(summary.to)})
            </span>
            <span className="font-semibold text-foreground">
              {tc("growth")}: {formatValue(summary.growth)}
            </span>
            {summary.interest !== null && (
              <span className="font-medium text-accent-text">
                {tc("interest")}: {formatValue(summary.interest)}
              </span>
            )}
          </div>
        )}
      </div>

      <div
        // `pan-y`: on mobile a horizontal drag selects a range and a vertical one still
        // scrolls the page.
        style={{ width: "100%", height, touchAction: selectable ? "pan-y" : undefined }}
        className="select-none"
        role="img"
        aria-label={tc("imageLabel", { title })}
      >
        <ResponsiveContainer>
          <AreaChart
            data={data}
            margin={{ top: 8, right: showYAxis ? 8 : 2, bottom: 0, left: showYAxis ? 8 : 2 }}
            {...selectionHandlers}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis<RechartsRow>
              dataKey={xKey}
              // Compact mode has no X axis either: the caller shows the date range above, so
              // the chart takes the full width without clipped labels.
              hide={!showYAxis}
              tick={{ fontSize: 12, fill: "var(--muted)" }}
              // Without `xFormat` no formatter is passed: the axis renders as before.
              tickFormatter={xFormat}
              // With hundreds of points (a daily series) Recharts would draw one label per
              // point: `xMinTickGap` spaces them and `preserveStartEnd` guarantees the ends.
              minTickGap={xMinTickGap}
              interval={xInterval}
            />
            <YAxis
              hide={!showYAxis}
              tick={{ fontSize: 12, fill: "var(--muted)" }}
              tickFormatter={formatAxisValue}
              width={70}
              domain={fittedYDomain ?? [0, "auto"]}
              // Without this Recharts extends the domain to include the baseline (0) it uses
              // internally to fill the stacked area, and the 1% fit has no visible effect.
              allowDataOverflow={yDomain === "fit"}
            />
            <Tooltip
              content={
                <ChartTooltip
                  labelPrefix={axisX}
                  totalKeys={showTotal ? totalKeys : []}
                  totalLabel={showTotal ? tc("total") : undefined}
                  currency={currency}
                  labelFormat={xFormat}
                />
              }
            />
            {showLegend && <Legend />}
            {stack.map((s) => (
              <Area<RechartsRow>
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.name}
                stackId="stack"
                stroke={s.color}
                fill={s.color}
                fillOpacity={0.25}
                strokeWidth={2}
              />
            ))}
            {bands.map((b) => (
              <Area
                key={`${b.lowKey}-${b.highKey}`}
                type="monotone"
                // Recharts draws a range area when `dataKey` returns [min, max].
                dataKey={(row: T) => [toNum(row[b.lowKey]), toNum(row[b.highKey])]}
                name={b.name}
                stroke="none"
                fill={b.color}
                fillOpacity={0.18}
                activeDot={false}
                isAnimationActive={false}
              />
            ))}
            {lines.map((l) => (
              <Line
                key={l.key}
                type="monotone"
                dataKey={l.key}
                name={l.name}
                stroke={l.color}
                strokeWidth={l.dashed === false ? 2 : 1.5}
                strokeDasharray={l.dashed === false ? undefined : "5 5"}
                dot={false}
              />
            ))}
            {shadedRanges.map((range, index) => (
              <ReferenceArea
                key={`shaded-${index}`}
                x1={range.from}
                x2={range.to}
                label={range.label}
                strokeOpacity={0}
                fill="var(--warning)"
                fillOpacity={0.1}
              />
            ))}
            {selection && (
              <ReferenceArea
                x1={Math.min(selection.start, selection.end)}
                x2={Math.max(selection.start, selection.end)}
                strokeOpacity={0}
                fill="var(--brand)"
                fillOpacity={0.12}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <ChartDataTable title={title} columns={tableColumns} rows={data} />
    </div>
  );
}
