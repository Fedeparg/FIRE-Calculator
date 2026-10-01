// Lógica pura de la pestaña Posiciones: valoración de una fila, filtro y búsqueda.
// Sin React, testeable. La comparten la lista y el panel de detalle, para que los dos
// enseñen siempre la misma cifra.

import { convertCurrency } from "@sextante/core/fx";

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
export function countByFilter(
  positions: readonly FilterablePosition[],
): Record<PositionFilter, number> {
  const counts: Record<PositionFilter, number> = { open: 0, closed: 0, derivatives: 0 };
  for (const position of positions) counts[positionFilterOf(position)] += 1;
  return counts;
}

/** Minúsculas y sin acentos: "Bróker" encuentra "broker" y al revés. */
function normalize(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
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
