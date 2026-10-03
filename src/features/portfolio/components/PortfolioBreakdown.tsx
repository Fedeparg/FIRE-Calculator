"use client";

import { useId, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { paletteColor } from "@/shared/charts/palette";
import { BREAKDOWN_GROUPS, buildBreakdown, type BreakdownGroupBy } from "@sextante/core/portfolio/breakdown";
import { useFormat } from "@/shared/format/use-format";
import type { PriceInfo, Position } from "@sextante/core/portfolio/types";

type Props = {
  positions: Position[];
  prices: Record<string, PriceInfo>;
  /** FX rates (USD per currency unit) to bring each value into the chosen currency. */
  rates: Record<string, number>;
  display: string;
};

/** Groups that are named one by one; the rest are summed into "N more". */
const VISIBLE_GROUPS = 3;

/**
 * Portfolio composition by asset, broker or currency, as a stacked bar with the heaviest groups
 * below. It fits in a narrow column and reads at a glance, which is what the Summary needs; each
 * position's detail lives in Positions.
 *
 * It splits the MARKET VALUE (not the cost): what it answers is what the portfolio is exposed to
 * today. Positions without a price or with a non-convertible currency are excluded and called out
 * separately, instead of splitting an incomplete total as if it were the right one.
 */
export default function PortfolioBreakdown({ positions, prices, rates, display }: Props) {
  const t = useTranslations("portfolio.breakdown");
  const { formatCurrency, formatPercent } = useFormat();
  const [groupBy, setGroupBy] = useState<BreakdownGroupBy>("asset");
  const [expanded, setExpanded] = useState(false);
  const listId = useId();

  const unknownBrokerLabel = t("noBroker");
  const breakdown = useMemo(
    () => buildBreakdown({ positions, prices, rates, display, groupBy, unknownBrokerLabel }),
    [positions, prices, rates, display, groupBy, unknownBrokerLabel],
  );

  // Collapsed: the heaviest ones and an "N more" row with their combined weight. Expanded: every group
  // (the bar above already draws them all; the list is what gets read).
  const rest = breakdown.slices.slice(VISIBLE_GROUPS);
  const shown = expanded ? breakdown.slices : breakdown.slices.slice(0, VISIBLE_GROUPS);
  const restShare = rest.reduce((sum, slice) => sum + slice.share, 0);

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-foreground">{t("title")}</h2>
        <label className="flex items-center gap-2 text-xs text-muted">
          <span className="sr-only">{t("groupByLabel")}</span>
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as BreakdownGroupBy)}
            className="rounded-lg border border-border bg-surface px-2 py-1.5 text-xs text-foreground"
          >
            {BREAKDOWN_GROUPS.map((group) => (
              <option key={group} value={group}>
                {t(`group.${group}`)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {breakdown.slices.length === 0 ? (
        <p className="text-sm text-muted">{t("noData")}</p>
      ) : (
        <>
          {/* Decorative: the same information is in the list below, which is what gets read. */}
          <div aria-hidden="true" className="flex h-3 overflow-hidden rounded-full bg-surface-2">
            {breakdown.slices.map((slice, index) => (
              <span
                key={slice.key}
                className="h-full"
                style={{ width: `${slice.share}%`, backgroundColor: paletteColor(index) }}
              />
            ))}
          </div>
          <ul id={listId} className="flex flex-col gap-2 text-sm">
            {shown.map((slice, index) => (
              <li key={slice.key} className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="h-2.5 w-2.5 shrink-0 rounded-sm"
                    style={{ backgroundColor: paletteColor(index) }}
                  />
                  <span className="truncate text-foreground" title={formatCurrency(slice.value, display)}>
                    {slice.label}
                  </span>
                </span>
                <span className="tabular-nums text-foreground">{formatPercent(Math.round(slice.share))}</span>
              </li>
            ))}
            {rest.length > 0 && !expanded && (
              <li className="flex items-center justify-between gap-3 text-muted">
                <span className="pl-[1.125rem]">{t("more", { count: rest.length })}</span>
                <span className="tabular-nums">{formatPercent(Math.round(restShare))}</span>
              </li>
            )}
          </ul>
          {rest.length > 0 && (
            // Toggle button with `aria-expanded`: announces whether the list is full or collapsed.
            <button
              type="button"
              onClick={() => setExpanded((open) => !open)}
              aria-expanded={expanded}
              aria-controls={listId}
              className="-mt-2 inline-flex min-h-8 items-center gap-1 self-start rounded-lg text-xs font-medium text-muted transition hover:text-foreground"
            >
              {expanded ? t("showLess") : t("showAll", { count: rest.length })}
              <svg
                aria-hidden="true"
                viewBox="0 0 20 20"
                className={`h-3.5 w-3.5 fill-current transition-transform ${expanded ? "rotate-180" : ""}`}
              >
                <path d="M5.5 7.5 10 12l4.5-4.5-1-1L10 10 6.5 6.5z" />
              </svg>
            </button>
          )}
          {breakdown.excluded > 0 && (
            <p className="text-xs text-muted">
              {t("excluded", { count: breakdown.excluded, total: positions.length })}
            </p>
          )}
        </>
      )}
    </section>
  );
}
