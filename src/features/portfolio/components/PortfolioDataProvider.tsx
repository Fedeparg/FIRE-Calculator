"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { aggregatePortfolio, type PortfolioAggregate } from "@sextante/core/portfolio/aggregate";
import { isPricePending, latestFetchedAt } from "@sextante/core/portfolio/prices";
import type { FxRates, PriceInfo, Position } from "@sextante/core/portfolio/types";
import { FX_PATH, listPositions, pricesPath, type PricesBySymbol } from "@/features/portfolio/api";
import { reconcileList, reconcileRecord } from "@/features/portfolio/model/reconcile";
import { useApiQuery } from "@/shared/api/use-api-query";

/** How often prices are re-requested while some position is still "fetching price". */
const PENDING_POLL_MS = 12_000;

/** Always the same object: a portfolio without prices must not invalidate the `useMemo`s that depend on them. */
const NO_PRICES: PricesBySymbol = {};

/**
 * What the portfolio tabs share: the DATA. It only changes when something actually changes (a
 * position, a price, the currency), because re-syncs preserve the identity of whatever did not
 * change (`reconcile.ts`).
 */
export type PortfolioData = {
  positions: Position[];
  /** Prepends a newly created position (same order as the backend). */
  addPosition: (position: Position) => void;
  /** Replaces an edited or merged position. */
  replacePosition: (position: Position) => void;
  removePosition: (id: string) => void;
  /** Re-syncs the positions with the API (source of truth). */
  refresh: () => Promise<void>;
  /** Last known prices per ticker (from our DB, never from the external source). */
  prices: Record<string, PriceInfo>;
  /** USD per unit of each currency. */
  rates: Record<string, number>;
  fxAsOf: string | null;
  /** Currency for the total, the history, the composition and the goal. */
  display: string;
  setDisplay: (currency: string) => void;
  /** Portfolio total in `display`. */
  agg: PortfolioAggregate;
};

/**
 * What depends on the CLOCK: which positions are still fetching a price and when prices were
 * checked. It lives in a separate context because it changes on every poll even when the data is
 * the same; this way only the components that show that freshness re-render.
 */
export type PortfolioFreshness = {
  /** Positions without a price that the server is still fetching (see `isPricePending`). */
  pendingIds: ReadonlySet<string>;
  pricesFetchedAt: string | null;
  pricesCheckedAt: number | null;
};

const PortfolioDataContext = createContext<PortfolioData | null>(null);
const PortfolioFreshnessContext = createContext<PortfolioFreshness | null>(null);

/** Portfolio data for any component under the tabs layout. */
export function usePortfolioData(): PortfolioData {
  const data = useContext(PortfolioDataContext);
  if (!data) throw new Error("usePortfolioData must be used inside <PortfolioDataProvider>");
  return data;
}

/** Price freshness (changes with the clock): only for whoever shows it. */
export function usePortfolioFreshness(): PortfolioFreshness {
  const freshness = useContext(PortfolioFreshnessContext);
  if (!freshness) throw new Error("usePortfolioFreshness must be used inside <PortfolioDataProvider>");
  return freshness;
}

type Props = {
  initialPositions: Position[];
  children: ReactNode;
};

/**
 * Portfolio state shared by its tabs (Summary, Positions, Capital gains, Goal).
 *
 * It lives in the tabs layout and not in each page for two reasons. One: the layout is not
 * remounted when switching tabs (React keeps it), so positions, prices and the chosen currency
 * survive navigation without being re-requested. Two: several tabs show the total, and if each
 * one aggregated on its own they could show two different "current net worth" figures.
 *
 * The initial load (SSR) arrives as props from the layout; authorization and per-user scoping
 * are always decided by the API.
 */
export default function PortfolioDataProvider({ initialPositions, children }: Props) {
  const [positions, setPositions] = useState<Position[]>(initialPositions);
  /**
   * When the prices were received (ms). It is the "now" the "updated … ago" is computed against:
   * it is set when the response arrives, not at render time, because reading the clock during
   * render would make it impure. Since the auto-refresh re-requests them, it does not go stale.
   */
  const [pricesCheckedAt, setPricesCheckedAt] = useState<number | null>(null);
  /**
   * "Now" (ms) for deciding which positions are still fetching a price. It is set when each price
   * response arrives, so it advances with polling and the "fetching" window expires on its own.
   */
  const [now, setNow] = useState(() => Date.now());
  const [display, setDisplay] = useState<string>("EUR");

  // Stable key of the distinct tickers: we only re-request prices if the SET changes
  // (not when editing quantity/average price). It is exactly the `?symbols=` the API expects.
  const tickersKey = useMemo(
    // Derivatives are not valued: their prices are not requested.
    () => [...new Set(positions.filter((p) => !p.isDerivative).map((p) => p.ticker))].sort().join(","),
    [positions],
  );

  // Prices come from our database (never from the external source), so repeating the read
  // is cheap: `refetchPrices` repeats it without the ticker set changing, which is what the
  // auto-refresh and the polling do (with the server's intraday refresh a price can change
  // during the day and the open tab has to find out). `keepPrevious`: while reloading,
  // the last prices stay on screen instead of emptying the portfolio.
  // Prices are stored in state as each response arrives, reconciled with the previous ones:
  // if the poll brings the same data, `prices` keeps its reference and nothing that depends on
  // them (the total, the list) is recomputed.
  const [loadedPrices, setLoadedPrices] = useState<PricesBySymbol>(NO_PRICES);
  const { refetch: refetchPrices } = useApiQuery<PricesBySymbol>(pricesPath(tickersKey), {
    keepPrevious: true,
    onSettled: (state) => {
      // The clock is read when the response arrives, not at render time (reading it in render would make it impure).
      const arrivedAt = Date.now();
      setNow(arrivedAt);
      if (state.status === "ready") {
        setPricesCheckedAt(arrivedAt);
        setLoadedPrices((prev) => reconcileRecord(prev, state.data));
      } else {
        setLoadedPrices(NO_PRICES);
      }
    },
  });
  // Prices are an enrichment: if they fail (or there is nothing to request), the portfolio stays
  // usable with the P&L shown as "—".
  const prices = tickersKey ? loadedPrices : NO_PRICES;

  // Key of the pending positions: the `Set` is only recreated when WHICH positions are
  // pending changes, not every time `now` advances.
  const pendingKey = positions
    .filter((p) => isPricePending(p, prices[p.ticker], now))
    .map((p) => p.id)
    .join(",");
  const pendingIds = useMemo<ReadonlySet<string>>(() => new Set(pendingKey ? pendingKey.split(",") : []), [pendingKey]);
  const hasPending = pendingIds.size > 0;

  // Short polling ONLY while something is pending: it reuses the same price load
  // (`refetchPrices`) and stops on its own when the price arrives or the window expires. In
  // the background it costs nothing; on returning to the tab, the auto-refresh below catches up.
  useEffect(() => {
    if (!hasPending) return;
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") refetchPrices();
    }, PENDING_POLL_MS);
    return () => clearInterval(interval);
  }, [hasPending, refetchPrices]);

  // FX rates: loaded once (they are global and change little; the total uses them to convert).
  // Without rates (failure or still loading) nothing is converted: `aggregatePortfolio` excludes what it cannot.
  const fxQuery = useApiQuery<FxRates>(FX_PATH);
  const fxRates = fxQuery.status === "ready" ? fxQuery.data : null;

  // Re-syncs the list with the server (source of truth). Needed when an external client
  // changes the portfolio without going through this tab: typically Claude/ChatGPT via MCP.
  const refresh = useCallback(async () => {
    try {
      const fresh = await listPositions();
      setPositions((prev) => reconcileList(prev, fresh));
    } catch {
      // Opportunistic re-sync: if it fails, the tab keeps what it had.
    }
  }, []);

  // Low-cost auto-refresh: revalidates when returning to the tab (typical case: you ask
  // Claude to add something and come back here) and with a slow poll that ONLY runs while the
  // tab is visible (in the background it costs nothing). Only `visibilitychange`: also listening
  // to `focus` fired two refreshes in a row when returning to the tab.
  useEffect(() => {
    const refreshIfVisible = () => {
      if (document.visibilityState !== "visible") return;
      void refresh();
      refetchPrices();
    };
    document.addEventListener("visibilitychange", refreshIfVisible);
    const interval = setInterval(refreshIfVisible, 60_000);
    return () => {
      document.removeEventListener("visibilitychange", refreshIfVisible);
      clearInterval(interval);
    };
  }, [refresh, refetchPrices]);

  // Local mutations after a create, edit or delete done in this tab (the API has already
  // confirmed them). They replace the raw `setPositions`: that way no consumer can leave the
  // list in an arbitrary state.
  const addPosition = useCallback((position: Position) => setPositions((prev) => [position, ...prev]), []);
  const replacePosition = useCallback(
    (position: Position) => setPositions((prev) => prev.map((p) => (p.id === position.id ? position : p))),
    [],
  );
  const removePosition = useCallback((id: string) => setPositions((prev) => prev.filter((p) => p.id !== id)), []);

  const rates = useMemo(() => fxRates?.rates ?? {}, [fxRates]);
  const pricesFetchedAt = useMemo(() => latestFetchedAt(prices), [prices]);
  const agg = useMemo(
    () => aggregatePortfolio({ positions, prices, rates, display }),
    [positions, prices, rates, display],
  );

  const data = useMemo<PortfolioData>(
    () => ({
      positions,
      addPosition,
      replacePosition,
      removePosition,
      refresh,
      prices,
      rates,
      fxAsOf: fxRates?.asOf ?? null,
      display,
      setDisplay,
      agg,
    }),
    [positions, addPosition, replacePosition, removePosition, refresh, prices, rates, fxRates, display, agg],
  );
  const freshness = useMemo<PortfolioFreshness>(
    () => ({ pendingIds, pricesFetchedAt, pricesCheckedAt }),
    [pendingIds, pricesFetchedAt, pricesCheckedAt],
  );

  return (
    <PortfolioDataContext.Provider value={data}>
      <PortfolioFreshnessContext.Provider value={freshness}>{children}</PortfolioFreshnessContext.Provider>
    </PortfolioDataContext.Provider>
  );
}
