// Composición de la cartera: agrupa las posiciones por activo, bróker o divisa y devuelve el
// peso de cada grupo sobre el valor total. Core puro (sin React), testeable.
//
// Reutiliza `convertCurrency` de `fx.ts` con EXACTAMENTE el mismo criterio que
// `aggregatePortfolio`: una posición entra si hay precio y si la divisa del precio es
// convertible a la divisa elegida. Las que no cumplen se excluyen y se cuentan, para poder
// decirlo en la interfaz en lugar de repartir un total incompleto como si fuera el bueno.

import { convertCurrency } from "./fx.js";

/** Criterio de agrupación del donut. */
export type BreakdownGroupBy = "asset" | "broker" | "currency";

/** Los tres criterios, en el orden en que se ofrecen en la interfaz. */
export const BREAKDOWN_GROUPS: readonly BreakdownGroupBy[] = ["asset", "broker", "currency"];

/** Entrada mínima: los mismos datos que ya maneja la cartera, sin acoplarse a sus tipos. */
export interface BreakdownInput {
  positions: readonly {
    ticker: string;
    name: string | null;
    quantity: number;
    broker: string | null;
    currency: string;
  }[];
  /** Último precio por ticker, cada uno con su divisa nativa. */
  prices: Record<string, { close: number; currency: string }>;
  /** USD por unidad de cada divisa (USD = 1). */
  rates: Record<string, number>;
  /** Divisa en la que se expresa el total. */
  display: string;
  groupBy: BreakdownGroupBy;
  /** Etiqueta para las posiciones sin bróker (traducida por quien llama: el core no traduce). */
  unknownBrokerLabel: string;
}

/** Un grupo del reparto, ya con su peso calculado. */
export interface BreakdownSlice {
  /** Clave estable del grupo (ticker, bróker o código de divisa). Sirve de `key` de React. */
  key: string;
  /** Texto a mostrar. */
  label: string;
  /** Valor de mercado del grupo en la divisa elegida. */
  value: number;
  /** Peso sobre el total, en % (0–100). */
  share: number;
  /** Posiciones agregadas en este grupo. */
  positions: number;
}

/** Reparto completo. */
export interface BreakdownResult {
  slices: BreakdownSlice[];
  /** Suma de los grupos: el valor de mercado de lo que SÍ se ha podido valorar. */
  total: number;
  /** Posiciones incluidas en el reparto. */
  included: number;
  /** Posiciones excluidas por falta de precio o de tipo de cambio. */
  excluded: number;
}

/**
 * Reparte el valor de mercado de la cartera entre los grupos del criterio elegido, ordenados
 * de mayor a menor peso (y por etiqueta a igualdad, para que el orden sea determinista).
 *
 * Se reparte el VALOR DE MERCADO, no el coste: la pregunta que responde un donut de
 * composición es "a qué está expuesta hoy mi cartera", y esa exposición la da el valor actual.
 *
 * Los valores negativos son imposibles aquí (cantidad y precio son ≥ 0), pero un precio
 * corrupto podría colarlos: se descartan como no valorables en vez de restar peso a otro grupo.
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

    const value = convertCurrency(
      position.quantity * price.close,
      price.currency,
      display,
      rates,
    );
    if (value === null || !Number.isFinite(value) || value < 0) continue;
    // `aggregatePortfolio` (el total del Resumen y el denominador del peso en Posiciones) también
    // exige poder convertir la divisa de la POSICIÓN para valorar el coste. Se exige igual aquí:
    // si no, el reparto sumaría una posición que ese total deja fuera y los pesos no cuadrarían.
    if (convertCurrency(1, position.currency, display, rates) === null) continue;

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
    .sort((a, b) => b.value - a.value || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));

  return { slices, total, included, excluded: positions.length - included };
}
