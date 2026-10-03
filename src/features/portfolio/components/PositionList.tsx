"use client";

import { useId, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { formatIsoDate } from "@/shared/format/format";
import { latestPriceDate } from "@sextante/core/portfolio/prices";
import { buildPositionRows, type GainMode } from "@/features/portfolio/model/rows";
import {
  DEFAULT_SORT_DIR,
  DEFAULT_SORT_KEY,
  sortPositions,
  type SortDir,
  type SortKey,
} from "@/features/portfolio/model/sort";
import { signedTone } from "@/shared/format/signed-tone";
import { useFormat } from "@/shared/format/use-format";
import type { PriceInfo, Position } from "@sextante/core/portfolio/types";
import ToggleGroup from "@/shared/ui/ToggleGroup";
import { PendingPrice, StaleBadge } from "./PriceStatus";
import SortHeader from "./SortHeader";

type Props = {
  positions: Position[];
  /** Last known price per ticker (from our DB). Empty while loading or without data. */
  prices: Record<string, PriceInfo>;
  /** USD per unit of each currency. */
  rates: Record<string, number>;
  /** Currency of the total: each row's weight is computed in it. */
  display: string;
  /** Total portfolio market value in `display` (the weight's denominator). */
  total: number;
  /** Position whose panel is open, or null. */
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Ids of the positions whose price is still being fetched (see `isPricePending`). */
  pendingIds: ReadonlySet<string>;
  /** Id of the detail panel, for `aria-controls`. */
  panelId: string;
};

/** The toggle's two options, in the order they are offered. */
const GAIN_MODES: readonly GainMode[] = ["today", "total"];

/** Sort criteria of the mobile selector, in the order they are offered. */
const SORT_OPTIONS: readonly SortKey[] = ["invested", "name", "marketValue", "pnl"];

/** Desktop list columns: asset, weight, value and gain. */
const COLUMNS = "md:grid-cols-[minmax(0,2.4fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1.2fr)]";

/**
 * Position list: asset, weight, current value and gain. Everything else (quantity, average price,
 * invested, trades) lives in the detail panel, which opens by clicking the row: this way the list
 * answers what people check daily and fits on a phone without horizontal scrolling.
 *
 * It is a list of buttons and not a `<table>`: each row is ONE action (open the detail), and on
 * mobile the same row stacks as a card without duplicating markup. Amounts are in each position's
 * currency (converted if the price is quoted in another); the weight, in the total's currency.
 *
 * Sorting: by default, by amount invested from highest to lowest, which is the only data that
 * exists before prices arrive (so the list does not reorder itself while loading). Columns are
 * sorted by clicking their header; on mobile, with the selector.
 */
export default function PositionList({
  positions,
  prices,
  rates,
  display,
  total,
  selectedId,
  onSelect,
  pendingIds,
  panelId,
}: Props) {
  const t = useTranslations("portfolio.list");
  const sortId = useId();
  const { formatCurrency, formatPercent, formatSignedCurrency, formatSignedPercent } = useFormat();
  const [sortKey, setSortKey] = useState<SortKey>(DEFAULT_SORT_KEY);
  const [sortDir, setSortDir] = useState<SortDir>(DEFAULT_SORT_DIR);
  const [gainMode, setGainMode] = useState<GainMode>("total");

  // First click on a column: highest first. Subsequent clicks: toggle the direction.
  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  // Freshness reference: the date of the portfolio's most recent price.
  const latestDate = useMemo(() => latestPriceDate(prices), [prices]);

  const rows = useMemo(
    () => buildPositionRows({ positions, prices, rates, display, total, latestDate, pendingIds, gainMode }),
    [positions, prices, rates, display, total, latestDate, pendingIds, gainMode],
  );

  const sortedRows = useMemo(() => sortPositions(rows, sortKey, sortDir), [rows, sortKey, sortDir]);
  const headerProps = { activeKey: sortKey, dir: sortDir, onSort: handleSort };

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2 md:px-5">
        <ToggleGroup
          label={t("gainModeLabel")}
          value={gainMode}
          options={GAIN_MODES.map((mode) => ({ value: mode, label: t(`gainMode.${mode}`) }))}
          onChange={setGainMode}
        />
        {/* Mobile: there are no column headers, so sorting uses a selector. */}
        <div className="flex items-center gap-2 md:hidden">
          <label htmlFor={sortId} className="text-xs text-muted">
            {t("sortLabel")}
          </label>
          <select
            id={sortId}
            value={sortKey}
            onChange={(e) => {
              const key = e.target.value as SortKey;
              setSortKey(key);
              setSortDir(key === "name" ? "asc" : "desc");
            }}
            className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-foreground"
          >
            {SORT_OPTIONS.map((key) => (
              <option key={key} value={key}>
                {t(`sort.${key}`)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div
        className={`hidden gap-3 border-b border-border bg-surface-2 px-5 py-2.5 text-xs font-semibold text-muted md:grid ${COLUMNS}`}
      >
        <SortHeader column="name" label={t("asset")} align="left" {...headerProps} />
        <span>{t("weight")}</span>
        <SortHeader column="marketValue" label={t("marketValue")} align="right" {...headerProps} />
        <SortHeader
          column="pnl"
          label={t(gainMode === "today" ? "gainToday" : "gain")}
          align="right"
          {...headerProps}
        />
      </div>

      <ul>
        {sortedRows.map((row) => {
          const p = row.position;
          const selected = selectedId === p.id;
          return (
            <li key={p.id} className="border-b border-border last:border-0">
              <button
                type="button"
                onClick={() => onSelect(p.id)}
                aria-pressed={selected}
                aria-controls={panelId}
                className={`flex min-h-14 w-full items-center justify-between gap-3 px-4 py-3 text-left transition md:grid md:px-5 ${COLUMNS} ${
                  selected ? "bg-brand-soft" : "hover:bg-surface-2"
                }`}
              >
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-sm font-semibold text-foreground">{p.name ?? p.ticker}</span>
                  <span className="truncate text-xs text-muted">
                    {/* On mobile there is no weight column: it goes here, before the symbol. */}
                    {row.weight !== null && (
                      <span className="md:hidden">{formatPercent(Math.round(row.weight))} · </span>
                    )}
                    {[p.ticker, p.broker].filter(Boolean).join(" · ")}
                  </span>
                </span>

                <span className="hidden items-center gap-2 text-sm text-foreground md:flex">
                  {row.weight !== null ? (
                    <>
                      <span aria-hidden="true" className="h-1.5 w-14 overflow-hidden rounded-full bg-surface-2">
                        <span
                          className="block h-full rounded-full bg-brand"
                          style={{ width: `${Math.min(100, row.weight)}%` }}
                        />
                      </span>
                      {formatPercent(Math.round(row.weight))}
                    </>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </span>

                {row.marketValue !== null ? (
                  <>
                    <span className="hidden items-center justify-end gap-1 text-sm tabular-nums text-foreground md:flex">
                      {formatCurrency(row.marketValue, p.currency)}
                      {/* `stale` implies there is a price and a more recent date to compare it with. */}
                      {row.stale && row.price && latestDate && (
                        <StaleBadge
                          label={t("stalePrice", {
                            date: formatIsoDate(row.price.date),
                            latest: formatIsoDate(latestDate),
                          })}
                        />
                      )}
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-0.5 tabular-nums">
                      {/* On mobile the value heads this column; on desktop it has its own. */}
                      <span className="text-sm text-foreground md:hidden">
                        {formatCurrency(row.marketValue, p.currency)}
                      </span>
                      {row.gain !== null ? (
                        <>
                          <span className={`hidden text-sm md:inline ${signedTone(row.gain.abs, "text-muted")}`}>
                            {formatSignedCurrency(row.gain.abs, p.currency)}
                          </span>
                          {row.gain.pct !== null && (
                            <span className={`text-xs ${signedTone(row.gain.pct, "text-muted")}`}>
                              {formatSignedPercent(Math.round(row.gain.pct * 10) / 10)}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-xs text-muted">—</span>
                      )}
                    </span>
                  </>
                ) : (
                  <span className="flex shrink-0 justify-end md:col-span-2">
                    {row.pending ? (
                      <PendingPrice label={t("pricePending")} hint={t("pricePendingHint")} />
                    ) : (
                      <span className="text-xs text-muted">{p.isDerivative ? t("notTracked") : t("noPriceShort")}</span>
                    )}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
