// Composición de la cartera por activo, bróker o divisa, con el peso de cada grupo. Core puro.
// Mismo criterio que `aggregatePortfolio`; las posiciones excluidas se cuentan para poder decirlo en
// la UI en vez de repartir un total incompleto como si fuera el bueno.

import { compareStrings } from "../compare.js";
import { canConvert, convertCurrency } from "../fx.js";

export type BreakdownGroupBy = "asset" | "broker" | "currency";

export const BREAKDOWN_GROUPS: readonly BreakdownGroupBy[] = ["asset", "broker", "currency"];

export interface BreakdownInput {
  positions: readonly {
    ticker: string;
    name: string | null;
    quantity: number;
    broker: string | null;
    currency: string;
  }[];
  prices: Record<string, { close: number; currency: string }>;
  rates: Record<string, number>;
  display: string;
  groupBy: BreakdownGroupBy;
  /** Etiqueta de las posiciones sin bróker (la traduce quien llama: el core no traduce). */
  unknownBrokerLabel: string;
}

export interface BreakdownSlice {
  /** Clave estable (ticker, bróker o divisa); sirve de `key` de React. */
  key: string;
  label: string;
  value: number;
  share: number;
  positions: number;
}

export interface BreakdownResult {
  slices: BreakdownSlice[];
  /** Suma de los grupos: el valor de lo que se ha podido valorar. */
  total: number;
  included: number;
  excluded: number;
}

/**
 * Reparte el valor de mercado (no el coste: un donut de composición muestra la exposición de hoy)
 * entre los grupos, de mayor a menor peso y por etiqueta a igualdad. Un precio corrupto que diera
 * un valor negativo se descarta como no valorable.
 */
export function buildBreakdown({
  positions,
  prices,
  rates,
  display,
  groupBy,
  unknownBrokerLabel,
}: BreakdownInput): BreakdownResult {
  const groups = new Map<string, BreakdownSlice>();
  let total = 0;
  let included = 0;

  for (const position of positions) {
    const price = prices[position.ticker];
    if (!price) continue;

    const value = convertCurrency(position.quantity * price.close, price.currency, display, rates);
    if (value === null || !Number.isFinite(value) || value < 0) continue;
    // como `aggregatePortfolio`, exige convertir la divisa de la posición: si no, los pesos no cuadrarían con el total
    if (!canConvert(position.currency, display, rates)) continue;

    const { key, label } =
      groupBy === "asset"
        ? { key: position.ticker, label: position.name?.trim() || position.ticker }
        : groupBy === "broker"
          ? {
              key: position.broker?.trim() || "",
              label: position.broker?.trim() || unknownBrokerLabel,
            }
          : { key: position.currency, label: position.currency };

    const existing = groups.get(key);
    if (existing) {
      existing.value += value;
      existing.positions += 1;
    } else {
      groups.set(key, { key, label, value, share: 0, positions: 1 });
    }

    total += value;
    included += 1;
  }

  const slices = [...groups.values()]
    .map((slice) => ({ ...slice, share: total > 0 ? (slice.value / total) * 100 : 0 }))
    .sort((a, b) => b.value - a.value || compareStrings(a.label, b.label));

  return { slices, total, included, excluded: positions.length - included };
}
