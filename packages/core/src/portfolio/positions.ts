// Lógica pura de la pestaña Posiciones (valoración, filtro, búsqueda), compartida por la lista y el detalle para mostrar la misma cifra.

import { convertCurrency } from "../fx.js";
import { valueInDisplay } from "./aggregate.js";

export interface ValuablePosition {
  quantity: number;
  avgPrice: number;
  currency: string;
}

export interface ClosePrice {
  close: number;
  currency: string;
}

/** Valoración en la divisa de la posición (la del coste). */
export interface PositionValuation {
  invested: number;
  /** Valor de mercado en la divisa de la posición; `null` sin precio o sin tasa. */
  marketValue: number | null;
  pnlAbs: number | null;
  /** `null` también si lo invertido es 0. */
  pnlPct: number | null;
}

/** Valora una posición; el precio puede venir en otra divisa (ETF en USD comprado en EUR) y solo sin tasa queda sin valorar. */
export function valuePosition(
  position: ValuablePosition,
  price: ClosePrice | undefined,
  rates: Record<string, number>,
): PositionValuation {
  const invested = position.quantity * position.avgPrice;
  const marketValue =
    price === undefined ? null : (valueInDisplay(position, price, rates, position.currency)?.marketValue ?? null);
  const pnlAbs = marketValue === null ? null : marketValue - invested;
  const pnlPct = pnlAbs !== null && invested > 0 ? (pnlAbs / invested) * 100 : null;
  return { invested, marketValue, pnlAbs, pnlPct };
}

/** Grupos del filtro; un derivado va siempre a "derivatives", esté o no cerrado. */
export const POSITION_FILTERS = ["open", "closed", "derivatives"] as const;
export type PositionFilter = (typeof POSITION_FILTERS)[number];

export interface FilterablePosition {
  ticker: string;
  name: string | null;
  broker: string | null;
  quantity: number;
  isDerivative: boolean;
}

export function positionFilterOf(position: FilterablePosition): PositionFilter {
  if (position.isDerivative) return "derivatives";
  return position.quantity > 0 ? "open" : "closed";
}

export function countByFilter(positions: readonly FilterablePosition[]): Record<PositionFilter, number> {
  const counts: Record<PositionFilter, number> = { open: 0, closed: 0, derivatives: 0 };
  for (const position of positions) counts[positionFilterOf(position)] += 1;
  return counts;
}

/** Minúsculas y sin acentos. */
function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/** ¿Casa con el buscador? Mira símbolo, nombre y bróker sin distinguir mayúsculas ni acentos; vacío casa con todo. */
export function matchesQuery(position: FilterablePosition, query: string): boolean {
  const needle = normalize(query.trim());
  if (!needle) return true;
  return [position.ticker, position.name, position.broker].some(
    (field) => field !== null && normalize(field).includes(needle),
  );
}

export interface MoverPosition extends FilterablePosition {
  id: string;
}

export interface DailyPrice {
  close: number;
  previousClose: number | null;
}

export interface DailyMove {
  id: string;
  name: string;
  changePct: number;
}

/**
 * Posiciones abiertas que más se han movido hoy (en valor absoluto). Es la variación del precio,
 * independiente de divisa y cantidad; sin cierre anterior positivo no hay variación y no entra.
 */
export function dailyMovers(
  positions: readonly MoverPosition[],
  prices: Record<string, DailyPrice | undefined>,
  limit: number,
): DailyMove[] {
  const moves: DailyMove[] = [];
  for (const position of positions) {
    if (positionFilterOf(position) !== "open") continue;
    const price = prices[position.ticker];
    if (!price || price.previousClose === null || !(price.previousClose > 0)) continue;
    const changePct = (price.close / price.previousClose - 1) * 100;
    if (!Number.isFinite(changePct)) continue;
    moves.push({ id: position.id, name: position.name ?? position.ticker, changePct });
  }
  return moves.sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct)).slice(0, limit);
}

export interface DailyGain {
  abs: number;
  pct: number;
}

/**
 * Ganancia de hoy: cantidad × (cierre − cierre anterior) en la divisa de la posición; el % es el del
 * precio, como en `dailyMovers`. `null` sin precio, sin cierre anterior positivo, sin cantidad
 * abierta o sin tasa.
 */
export function dailyGain(
  position: ValuablePosition,
  price: (DailyPrice & ClosePrice) | undefined,
  rates: Record<string, number>,
): DailyGain | null {
  if (!price || price.previousClose === null || !(price.previousClose > 0)) return null;
  if (!(position.quantity > 0)) return null;
  const abs = convertCurrency(
    position.quantity * (price.close - price.previousClose),
    price.currency,
    position.currency,
    rates,
  );
  const pct = (price.close / price.previousClose - 1) * 100;
  if (abs === null || !Number.isFinite(abs) || !Number.isFinite(pct)) return null;
  return { abs, pct };
}
