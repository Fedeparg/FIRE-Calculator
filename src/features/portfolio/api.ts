/**
 * Portfolio API calls (positions, lots, income, prices, FX, instrument search).
 * No React: tested without a DOM. Authorization and per-user scoping are decided by the API;
 * this module only transports data and maps failures to i18n keys.
 */

import type { IncomeEvent, IncomePayload } from "@sextante/core/fiscal/income";
import type { PendingNegative } from "@sextante/core/fiscal/savings-base";
import type {
  AssetClass,
  InstrumentSearchResult,
  LotPayload,
  Position,
  PositionLot,
  PositionPayload,
  PriceInfo,
} from "@sextante/core/portfolio/types";
import { ApiError, NO_STORE, apiJson, createApiErrorMapper } from "@/shared/api/client";

export const FX_PATH = "/api/prices/fx";

/** Price route for a set of tickers; `null` if there is nothing to request. */
export function pricesPath(tickersKey: string): string | null {
  return tickersKey ? `/api/prices?symbols=${encodeURIComponent(tickersKey)}` : null;
}

export type PricesBySymbol = Record<string, PriceInfo>;

export function historyPath(days: number, display: string): string {
  return `/api/portfolio/history?days=${days}&display=${encodeURIComponent(display)}`;
}

export function lotsPath(positionId: string): string {
  return `/api/positions/${positionId}/lots`;
}

/** Re-syncs the position list (source of truth: the API). */
export function listPositions(): Promise<Position[]> {
  return apiJson<Position[]>("/api/positions", NO_STORE);
}

/** Creates (`editingId === null`) or edits a position. */
export function savePosition(editingId: string | null, payload: PositionPayload): Promise<Position> {
  return apiJson<Position>(editingId ? `/api/positions/${editingId}` : "/api/positions", {
    method: editingId ? "PATCH" : "POST",
    body: payload,
  });
}

/** Merges a purchase into the existing position (weighted average). */
export function combinePosition(
  id: string,
  payload: { quantity: number; avgPrice: number; currency: string },
): Promise<Position> {
  return apiJson<Position>(`/api/positions/${id}/combine`, { method: "POST", body: payload });
}

export function deletePosition(id: string): Promise<void> {
  return apiJson<void>(`/api/positions/${id}`, { method: "DELETE" });
}

/** Creates (`lotId === null`) or edits a lot. */
export function saveLot(positionId: string, lotId: string | null, payload: LotPayload): Promise<PositionLot> {
  return apiJson<PositionLot>(lotId ? `${lotsPath(positionId)}/${lotId}` : lotsPath(positionId), {
    method: lotId ? "PATCH" : "POST",
    body: payload,
  });
}

export function deleteLot(positionId: string, lotId: string): Promise<void> {
  return apiJson<void>(`${lotsPath(positionId)}/${lotId}`, { method: "DELETE" });
}

/** The user's income; with `positionId`, only that position's. */
export function incomePath(positionId?: string): string {
  return positionId ? `/api/income?positionId=${encodeURIComponent(positionId)}` : "/api/income";
}

/** Creates (`incomeId === null`) or edits an income entry. */
export function saveIncome(incomeId: string | null, payload: IncomePayload): Promise<IncomeEvent> {
  return apiJson<IncomeEvent>(incomeId ? `/api/income/${incomeId}` : "/api/income", {
    method: incomeId ? "PATCH" : "POST",
    body: payload,
  });
}

export function deleteIncome(incomeId: string): Promise<void> {
  return apiJson<void>(`/api/income/${incomeId}`, { method: "DELETE" });
}

/** Classifies a position (stock, fund or ETF, derivative or other) for the tax return. */
export function setAssetClass(positionId: string, assetClass: AssetClass): Promise<Position> {
  return apiJson<Position>(`/api/positions/${positionId}`, { method: "PATCH", body: { assetClass } });
}

/** Replaces the pending negative balances from years Sextante does not compute. */
export function savePendingBalances(balances: PendingNegative[]): Promise<PendingNegative[]> {
  return apiJson<PendingNegative[]>("/api/tax-return/pending-balances", { method: "PUT", body: { balances } });
}

/** Instrument search results; `signal` cancels the request (debounce). */
export async function searchInstruments(query: string, signal: AbortSignal): Promise<InstrumentSearchResult[]> {
  const body = await apiJson<{ results: InstrumentSearchResult[] }>(
    `/api/instruments/search?q=${encodeURIComponent(query)}`,
    { signal },
  );
  return body.results;
}

/** 409 conflict from creating/editing a position, with what the UI needs to react. */
export type PositionConflict =
  { kind: "hasSales" } | { kind: "brokerRequired" } | { kind: "duplicate"; existing: Position };

/**
 * Reads a 409 from `POST/PATCH /api/positions`. DUPLICATE: that symbol+broker already exists
 * (on create, merging is offered). BROKER_REQUIRED: the symbol already exists and the broker is
 * missing. HAS_SALES: the position has sales, and changing quantity/price by hand would erase its
 * history. `null` if it is not a known conflict (treated as any other failure).
 */
export function positionConflict(error: unknown): PositionConflict | null {
  if (!(error instanceof ApiError) || error.status !== 409) return null;
  if (error.code === "HAS_SALES") return { kind: "hasSales" };
  if (error.code === "BROKER_REQUIRED") return { kind: "brokerRequired" };
  if (error.code === "DUPLICATE" && typeof error.body === "object" && error.body !== null && "existing" in error.body) {
    // The body comes from our own API: its shape is trusted, as with every other response.
    return { kind: "duplicate", existing: error.body.existing as Position };
  }
  return null;
}

/** i18n key for a positions failure: the common ones plus the 409 `HAS_SALES`. */
export const positionErrorKey = createApiErrorMapper({
  codes: { HAS_SALES: "errorHasSales" },
  invalidFallback: "errorInvalid",
});

export type PositionErrorKey = ReturnType<typeof positionErrorKey>;
