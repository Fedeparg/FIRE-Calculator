// Lógica pura de la pestaña Posiciones: valoración de una fila, filtro y búsqueda.
// Sin React, testeable. La comparten la lista y el panel de detalle, para que los dos
// enseñen siempre la misma cifra.

import { convertCurrency } from "../fx.js";

/** Lo mínimo de una posición para valorarla. */
export interface ValuablePosition {
  quantity: number;
  avgPrice: number;
  currency: string;
}

/** Último precio conocido, en su divisa nativa. */
export interface ClosePrice {
  close: number;
  currency: string;
}

/** Valoración de una posición en SU divisa (la del coste). */
export interface PositionValuation {
  /** Cantidad × precio medio. */
  invested: number;
  /** Valor de mercado convertido a la divisa de la posición, o `null` sin precio o sin tasa. */
  marketValue: number | null;
  pnlAbs: number | null;
  /** `null` también si lo invertido es 0 (un % sobre nada no dice nada). */
  pnlPct: number | null;
}

/**
 * Valora una posición. El precio puede venir en otra divisa (un ETF que cotiza en USD comprado
 * en EUR): se convierte a la de la posición con las tasas diarias, y solo si falta la tasa se
 * queda sin valorar.
 */
export function valuePosition(
  position: ValuablePosition,
  price: ClosePrice | undefined,
  rates: Record<string, number>,
): PositionValuation {
  const invested = position.quantity * position.avgPrice;
  const marketValue =
    price === undefined
      ? null
      : convertCurrency(position.quantity * price.close, price.currency, position.currency, rates);
  const pnlAbs = marketValue === null ? null : marketValue - invested;
  const pnlPct = pnlAbs !== null && invested > 0 ? (pnlAbs / invested) * 100 : null;
  return { invested, marketValue, pnlAbs, pnlPct };
}

/** Grupos del filtro de la lista. Un derivado va siempre a "derivatives", esté o no cerrado. */
export const POSITION_FILTERS = ["open", "closed", "derivatives"] as const;
export type PositionFilter = (typeof POSITION_FILTERS)[number];

/** Lo mínimo de una posición para filtrarla y buscarla. */
export interface FilterablePosition {
  ticker: string;
  name: string | null;
  broker: string | null;
  quantity: number;
  isDerivative: boolean;
}

/** Grupo al que pertenece una posición. */
export function positionFilterOf(position: FilterablePosition): PositionFilter {
  if (position.isDerivative) return "derivatives";
  return position.quantity > 0 ? "open" : "closed";
}

/** Cuántas posiciones hay en cada grupo (para los contadores del filtro). */
export function countByFilter(positions: readonly FilterablePosition[]): Record<PositionFilter, number> {
  const counts: Record<PositionFilter, number> = { open: 0, closed: 0, derivatives: 0 };
  for (const position of positions) counts[positionFilterOf(position)] += 1;
  return counts;
}

/** Minúsculas y sin acentos: "Bróker" encuentra "broker" y al revés. */
function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/**
 * ¿Casa la posición con lo que se ha escrito en el buscador? Busca en símbolo, nombre y
 * bróker, sin distinguir mayúsculas ni acentos. Una búsqueda vacía casa con todo.
 */
export function matchesQuery(position: FilterablePosition, query: string): boolean {
  const needle = normalize(query.trim());
  if (!needle) return true;
  return [position.ticker, position.name, position.broker].some(
    (field) => field !== null && normalize(field).includes(needle),
  );
}

/** Lo mínimo de una posición para su variación del día. */
export interface MoverPosition extends FilterablePosition {
  id: string;
}

/** Último precio y cierre anterior, en la divisa nativa del instrumento. */
export interface DailyPrice {
  close: number;
  previousClose: number | null;
}

/** Variación del día de una posición. */
export interface DailyMove {
  id: string;
  name: string;
  /** Variación del precio respecto al cierre anterior, en %. */
  changePct: number;
}

/**
 * Las posiciones abiertas que más se han movido hoy (en valor absoluto), de mayor a menor. Es
 * la variación del PRECIO, la misma para cualquier tenedor: no depende de la divisa ni de la
 * cantidad. Sin cierre anterior (primer dato) o con un cierre anterior no positivo, la posición
 * no entra: no hay variación que contar.
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

/** Ganancia del día de una posición: importe en SU divisa y variación del precio en %. */
export interface DailyGain {
  abs: number;
  pct: number;
}

/**
 * Ganancia de hoy de una posición: cantidad × (cierre − cierre anterior), convertida a la
 * divisa de la posición (el precio puede cotizar en otra). El % es el del PRECIO, el mismo que
 * usa `dailyMovers`. Devuelve `null` si no hay dato que contar: sin precio, sin cierre
 * anterior (primer dato), con un cierre anterior no positivo, sin cantidad abierta o sin tasa
 * para convertir. Una posición cerrada no gana nada hoy porque no tiene nada en cartera.
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
