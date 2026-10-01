// Filas de la lista de posiciones: valoración, peso, frescura del precio y datos de orden.
// Core puro (sin React), testeable.

import { convertCurrency } from "@sextante/core/fx";
import type { Position, PriceInfo } from "@/lib/portfolio";
import { isStalePrice } from "@/core/portfolio-prices";
import { dailyGain, valuePosition, type PositionValuation } from "@/core/portfolio-positions";
import type { SortableRow } from "./sort";

/** Qué ganancia enseña la columna: la de hoy (cierre anterior) o la total (frente a lo invertido). */
export type GainMode = "today" | "total";

/** Fila enriquecida: lo que se pinta y lo que se compara para ordenar. */
export type PositionRow = PositionValuation & {
  position: Position;
  price: PriceInfo | undefined;
  /** Peso sobre el total, en % (0–100), o null si la fila no se puede valorar. */
  weight: number | null;
  stale: boolean;
  pending: boolean;
  /** Ganancia según el modo activo (importe en la divisa de la posición y %), o null sin dato. */
  gain: { abs: number; pct: number | null } | null;
  sortable: SortableRow;
};

/** Divisa base para comparar importes entre posiciones (las tasas son USD por unidad). */
const BASE_CURRENCY = "USD";

/**
 * Convierte un importe a la base (USD) solo para ORDENAR importes de posiciones en divisas
 * distintas de forma justa. `null` si falta la tasa (esa fila va al final). No se muestra.
 */
export function toBase(amount: number | null, currency: string, rates: Record<string, number>): number | null {
  if (amount === null) return null;
  if (currency === BASE_CURRENCY) return amount;
  const rate = rates[currency];
  return Number.isFinite(rate) && rate ? amount * rate : null;
}

export type BuildRowsInput = {
  positions: readonly Position[];
  /** Último precio conocido por ticker. */
  prices: Record<string, PriceInfo>;
  rates: Record<string, number>;
  /** Divisa del total: el peso de cada fila se calcula en ella. */
  display: string;
  /** Valor de mercado total en `display` (denominador del peso). */
  total: number;
  /** Fecha del precio más reciente de la cartera (referencia de frescura). */
  latestDate: string | null;
  /** Ids de las posiciones cuyo precio aún se está buscando. */
  pendingIds: ReadonlySet<string>;
  gainMode: GainMode;
};

export function buildPositionRows(input: BuildRowsInput): PositionRow[] {
  const { prices, rates, display, total, latestDate, pendingIds, gainMode } = input;
  return input.positions.map((position) => {
    const price = prices[position.ticker];
    const valuation = valuePosition(position, price, rates);
    const inDisplay =
      valuation.marketValue === null ? null : convertCurrency(valuation.marketValue, position.currency, display, rates);
    // Ordenar por la columna de ganancia usa SIEMPRE lo que se ve: el importe del modo activo.
    const gain =
      gainMode === "today"
        ? dailyGain(position, price, rates)
        : valuation.pnlAbs === null
          ? null
          : { abs: valuation.pnlAbs, pct: valuation.pnlPct };
    return {
      ...valuation,
      gain,
      position,
      price,
      weight: inDisplay !== null && total > 0 ? (inDisplay / total) * 100 : null,
      stale: isStalePrice(price, latestDate),
      pending: pendingIds.has(position.id),
      sortable: {
        ticker: position.ticker,
        name: position.name ?? position.ticker,
        broker: position.broker,
        quantity: position.quantity,
        avgPrice: toBase(position.avgPrice, position.currency, rates),
        invested: toBase(valuation.invested, position.currency, rates),
        marketValue: toBase(valuation.marketValue, position.currency, rates),
        pnl: toBase(gain?.abs ?? null, position.currency, rates),
      },
    };
  });
}
