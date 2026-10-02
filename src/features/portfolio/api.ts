/**
 * Llamadas de la cartera a la API (posiciones, lotes, cobros, precios, FX, buscador de instrumentos).
 * Sin React: se prueba sin DOM. La autorización y el scoping por usuario los decide la API;
 * aquí solo se transporta y se traducen los fallos a claves i18n.
 */

import type { IncomeEvent, IncomePayload } from "@sextante/core/fiscal/income";
import type { PendingNegative } from "@sextante/core/fiscal/savings-base";
import type {
  InstrumentSearchResult,
  LotPayload,
  Position,
  PositionLot,
  PositionPayload,
  PriceInfo,
} from "@sextante/core/portfolio/types";
import { ApiError, NO_STORE, apiErrorKey, apiJson, type ApiErrorKey } from "@/shared/api/client";

export const FX_PATH = "/api/prices/fx";

/** Ruta de precios de un conjunto de tickers; `null` si no hay ninguno que pedir. */
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

/** Re-sincroniza la lista de posiciones (fuente de verdad: la API). */
export function listPositions(): Promise<Position[]> {
  return apiJson<Position[]>("/api/positions", NO_STORE);
}

/** Alta (`editingId === null`) o edición de una posición. */
export function savePosition(editingId: string | null, payload: PositionPayload): Promise<Position> {
  return apiJson<Position>(editingId ? `/api/positions/${editingId}` : "/api/positions", {
    method: editingId ? "PATCH" : "POST",
    body: payload,
  });
}

/** Combina una compra con la posición existente (media ponderada). */
export function combinePosition(
  id: string,
  payload: { quantity: number; avgPrice: number; currency: string },
): Promise<Position> {
  return apiJson<Position>(`/api/positions/${id}/combine`, { method: "POST", body: payload });
}

export function deletePosition(id: string): Promise<void> {
  return apiJson<void>(`/api/positions/${id}`, { method: "DELETE" });
}

/** Alta (`lotId === null`) o edición de un lote. */
export function saveLot(positionId: string, lotId: string | null, payload: LotPayload): Promise<PositionLot> {
  return apiJson<PositionLot>(lotId ? `${lotsPath(positionId)}/${lotId}` : lotsPath(positionId), {
    method: lotId ? "PATCH" : "POST",
    body: payload,
  });
}

export function deleteLot(positionId: string, lotId: string): Promise<void> {
  return apiJson<void>(`${lotsPath(positionId)}/${lotId}`, { method: "DELETE" });
}

/** Cobros del usuario; con `positionId`, solo los de esa posición. */
export function incomePath(positionId?: string): string {
  return positionId ? `/api/income?positionId=${encodeURIComponent(positionId)}` : "/api/income";
}

/** Alta (`incomeId === null`) o edición de un cobro. */
export function saveIncome(incomeId: string | null, payload: IncomePayload): Promise<IncomeEvent> {
  return apiJson<IncomeEvent>(incomeId ? `/api/income/${incomeId}` : "/api/income", {
    method: incomeId ? "PATCH" : "POST",
    body: payload,
  });
}

export function deleteIncome(incomeId: string): Promise<void> {
  return apiJson<void>(`/api/income/${incomeId}`, { method: "DELETE" });
}

/** Sustituye los saldos negativos pendientes de años que Sextante no calcula. */
export function savePendingBalances(balances: PendingNegative[]): Promise<PendingNegative[]> {
  return apiJson<PendingNegative[]>("/api/tax-return/pending-balances", { method: "PUT", body: { balances } });
}

/** Resultados del buscador de instrumentos; `signal` cancela la petición (debounce). */
export async function searchInstruments(query: string, signal: AbortSignal): Promise<InstrumentSearchResult[]> {
  const body = await apiJson<{ results: InstrumentSearchResult[] }>(
    `/api/instruments/search?q=${encodeURIComponent(query)}`,
    { signal },
  );
  return body.results;
}

/** Claves del formulario de posición: las comunes más el 409 `HAS_SALES`. */
export type PositionErrorKey = ApiErrorKey | "errorHasSales";

/** Conflicto 409 del alta/edición de posiciones, con lo que la UI necesita para reaccionar. */
export type PositionConflict =
  { kind: "hasSales" } | { kind: "brokerRequired" } | { kind: "duplicate"; existing: Position };

/**
 * Lee un 409 de `POST/PATCH /api/positions`. DUPLICATE: ya existe ese símbolo+bróker (en alta
 * se ofrece combinar). BROKER_REQUIRED: el símbolo ya existe y falta el bróker. HAS_SALES: la
 * posición tiene ventas y cambiar cantidad/precio a mano borraría su histórico. `null` si no es
 * un conflicto conocido (se trata como un fallo cualquiera).
 */
export function positionConflict(error: unknown): PositionConflict | null {
  if (!(error instanceof ApiError) || error.status !== 409) return null;
  if (error.code === "HAS_SALES") return { kind: "hasSales" };
  if (error.code === "BROKER_REQUIRED") return { kind: "brokerRequired" };
  if (error.code === "DUPLICATE" && typeof error.body === "object" && error.body !== null && "existing" in error.body) {
    // El cuerpo viene de nuestra API: se confía en su forma, como en el resto de respuestas.
    return { kind: "duplicate", existing: error.body.existing as Position };
  }
  return null;
}

/** Clave i18n de un fallo de posiciones (sin volcar el `message` del servidor, que está en castellano). */
export function positionErrorKey(error: unknown): PositionErrorKey {
  return positionConflict(error)?.kind === "hasSales" ? "errorHasSales" : apiErrorKey(error);
}
