"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import {
  countByFilter,
  matchesQuery,
  positionFilterOf,
  POSITION_FILTERS,
  type PositionFilter,
} from "@sextante/core/portfolio/positions";
import { usePathname, useRouter } from "@/i18n/navigation";
import ToggleGroup from "@/shared/ui/ToggleGroup";
import type { Position } from "@sextante/core/portfolio/types";
import { ADD_POSITION_PARAM } from "../add-position";
import DerivativesNotice from "./DerivativesNotice";
import PortfolioExport from "./PortfolioExport";
import { usePortfolioData, usePortfolioFreshness } from "./PortfolioDataProvider";
import PositionDetail, { POSITION_DETAIL_TITLE_ID } from "./PositionDetail";
import PositionForm, { POSITION_FORM_TITLE_ID } from "./PositionForm";
import PositionList from "./PositionList";
import PositionPanel from "./PositionPanel";

/** Id of the side panel (referenced by the rows via `aria-controls`). */
const PANEL_ID = "position-panel";

/** What the side panel shows. */
type PanelState = { kind: "closed" } | { kind: "detail"; id: string } | { kind: "add" } | { kind: "edit"; id: string };

/**
 * Positions tab: search and filter attached to the list, and a panel for the detail, creating and
 * editing. The panel opens NEXT to the row on desktop and as a bottom sheet on mobile, instead of
 * below the whole table or at the end of the page.
 */
export default function PortfolioPositionsTab() {
  const t = useTranslations("portfolio");
  const { positions, addPosition, replacePosition, removePosition, refresh, prices, rates, display, agg } =
    usePortfolioData();
  const { pendingIds } = usePortfolioFreshness();
  const [filter, setFilter] = useState<PositionFilter>("open");
  const [query, setQuery] = useState("");
  const [panel, setPanel] = useState<PanelState>({ kind: "closed" });

  // The header's "Add position" arrives with `?nueva=1`: it opens the create form and cleans the
  // URL, so reloading or going back does not reopen it.
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const addRequested = searchParams.get(ADD_POSITION_PARAM) === "1";
  // State is adjusted DURING render on seeing the parameter (React's pattern for
  // "state that depends on a prop"), not in an effect: that way there is no intermediate render
  // with the panel closed. `seenAdd` avoids reopening it while the URL has not been cleaned yet.
  const [seenAdd, setSeenAdd] = useState(false);
  if (addRequested !== seenAdd) {
    setSeenAdd(addRequested);
    if (addRequested) setPanel({ kind: "add" });
  }
  useEffect(() => {
    if (addRequested) router.replace(pathname, { scroll: false });
  }, [addRequested, pathname, router]);

  const counts = useMemo(() => countByFilter(positions), [positions]);
  const listed = useMemo(
    () => positions.filter((p) => positionFilterOf(p) === filter && matchesQuery(p, query)),
    [positions, filter, query],
  );

  // The panel stores ids, not positions: so when `refresh()` brings the re-aggregated quantity and
  // average price, or the position disappears because another client (MCP) deleted it, it just works.
  const selected =
    panel.kind === "detail" || panel.kind === "edit" ? (positions.find((p) => p.id === panel.id) ?? null) : null;
  const panelOpen = panel.kind === "add" || selected !== null;

  const closePanel = useCallback(() => setPanel({ kind: "closed" }), []);

  function handleCreated(position: Position) {
    // Most recent first, same as the backend order. Its detail opens: that is what one
    // wants to see right after creating it.
    addPosition(position);
    setPanel({ kind: "detail", id: position.id });
  }

  // Edit or merge: replaces the position and goes back to its detail.
  function handleSaved(position: Position) {
    replacePosition(position);
    setPanel({ kind: "detail", id: position.id });
  }

  function handleDeleted(id: string) {
    removePosition(id);
    setPanel({ kind: "closed" });
  }

  return (
    <div className={`grid grid-cols-1 items-start gap-6 ${panelOpen ? "lg:grid-cols-[minmax(0,1fr)_26rem]" : ""}`}>
      <div className="flex min-w-0 flex-col gap-4">
        {positions.length === 0 ? (
          <div className="rounded-2xl border border-border bg-surface p-8 text-center">
            <p className="text-foreground">{t("empty.title")}</p>
            <p className="mt-1 text-sm text-muted">{t("empty.body")}</p>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <label className="relative block">
                  <span className="sr-only">{t("positions.searchLabel")}</span>
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  >
                    <circle cx="11" cy="11" r="7" />
                    <path d="m20 20-3.5-3.5" />
                  </svg>
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t("positions.searchPlaceholder")}
                    className="h-11 w-full rounded-xl border border-border bg-surface pl-9 pr-3 text-sm text-foreground outline-hidden focus:border-brand focus:ring-2 focus:ring-brand/30 sm:w-72"
                  />
                </label>
                <ToggleGroup
                  label={t("positions.filterLabel")}
                  value={filter}
                  options={POSITION_FILTERS.map((option) => ({
                    value: option,
                    label: (
                      <>
                        {t(`positions.filter.${option}`)} <span className="tabular-nums">{counts[option]}</span>
                      </>
                    ),
                  }))}
                  onChange={setFilter}
                  layout="fillOnMobile"
                />
              </div>
              <PortfolioExport positions={positions} prices={prices} rates={rates} display={display} />
            </div>

            {filter === "derivatives" && counts.derivatives > 0 && <DerivativesNotice />}

            {listed.length > 0 ? (
              <PositionList
                positions={listed}
                prices={prices}
                rates={rates}
                display={display}
                total={agg.marketValue}
                selectedId={selected?.id ?? null}
                onSelect={(id) =>
                  setPanel((cur) =>
                    cur.kind === "detail" && cur.id === id ? { kind: "closed" } : { kind: "detail", id },
                  )
                }
                pendingIds={pendingIds}
                panelId={PANEL_ID}
              />
            ) : (
              <p className="rounded-2xl border border-border bg-surface p-6 text-center text-sm text-muted">
                {query.trim() ? t("positions.noMatches") : t(`positions.empty.${filter}`)}
              </p>
            )}
          </>
        )}
      </div>

      {panel.kind === "add" && (
        <PositionPanel id={PANEL_ID} labelledBy={POSITION_FORM_TITLE_ID} onClose={closePanel}>
          <PositionForm editing={null} onCreated={handleCreated} onSaved={handleSaved} onCancelEdit={closePanel} />
        </PositionPanel>
      )}
      {panel.kind === "edit" && selected && (
        <PositionPanel id={PANEL_ID} labelledBy={POSITION_FORM_TITLE_ID} onClose={closePanel}>
          <PositionForm
            key={selected.id}
            editing={selected}
            onCreated={handleCreated}
            onSaved={handleSaved}
            onCancelEdit={() => setPanel({ kind: "detail", id: selected.id })}
          />
        </PositionPanel>
      )}
      {panel.kind === "detail" && selected && (
        <PositionPanel id={PANEL_ID} labelledBy={POSITION_DETAIL_TITLE_ID} onClose={closePanel}>
          <PositionDetail
            // Switching position remounts: trades and the simulation start from scratch.
            key={selected.id}
            position={selected}
            price={prices[selected.ticker]}
            rates={rates}
            pricePending={pendingIds.has(selected.id)}
            onMutated={refresh}
            onEdit={() => setPanel({ kind: "edit", id: selected.id })}
            onDeleted={handleDeleted}
          />
        </PositionPanel>
      )}
    </div>
  );
}
