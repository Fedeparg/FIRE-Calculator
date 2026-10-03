// Tipos de cambio de referencia del BCE para pasar a euros operaciones en divisa. Core puro:
// la serie la descarga y cachea la API (`apps/api/src/fx-reference/`). Criterio fiscal y
// fuentes: ver ./README.md, sección `fx-reference.ts`.

import { daysBetween } from "../dates.js";

/** Divisa en la que se declara el IRPF. */
export const TAX_CURRENCY = "EUR";

/**
 * Días máximos entre la fecha pedida y la última publicación anterior. El BCE no publica en
 * fines de semana ni en los festivos de TARGET2 (el hueco más largo es Viernes Santo + Lunes de
 * Pascua: de jueves a martes, 5 días); más allá, falta la serie, no es un festivo.
 */
export const MAX_RATE_GAP_DAYS = 7;

/** Una publicación del BCE: unidades de la divisa por 1 euro (1 EUR = 1,1225 USD). */
export interface ReferenceRatePoint {
  /** Día publicado (`YYYY-MM-DD`). */
  date: string;
  unitsPerEur: number;
}

/** Series por divisa (código ISO 4217), cada una en orden ascendente de fecha. */
export type ReferenceRates = Readonly<Record<string, readonly ReferenceRatePoint[]>>;

/** Tipo aplicado a una operación, con la publicación de la que sale (trazabilidad). */
export interface AppliedRate {
  currency: string;
  unitsPerEur: number;
  /** Día de la publicación usada: el de la operación o el último hábil anterior. */
  date: string;
}

/**
 * Tipo de referencia vigente en `date` para `currency`: el publicado ese día o, si no hubo
 * publicación (fin de semana, festivo), el último anterior. `null` si la divisa no tiene serie,
 * si no hay publicación anterior o si la última queda a más de `MAX_RATE_GAP_DAYS`: mejor sin
 * cifra que con un cambio que no corresponde a la fecha.
 */
export function referenceRateOn(rates: ReferenceRates, currency: string, date: string): AppliedRate | null {
  if (currency === TAX_CURRENCY) return { currency, unitsPerEur: 1, date };
  const series = rates[currency];
  if (!series || series.length === 0) return null;

  // Búsqueda binaria de la última publicación con fecha <= `date`.
  let lo = 0;
  let hi = series.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid].date <= date) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (found < 0) return null;

  const point = series[found];
  if (!Number.isFinite(point.unitsPerEur) || point.unitsPerEur <= 0) return null;
  if (daysBetween(point.date, date) > MAX_RATE_GAP_DAYS) return null;
  return { currency, unitsPerEur: point.unitsPerEur, date: point.date };
}

/** Importe en divisa → euros con un tipo ya elegido. */
export function toEur(amount: number, rate: AppliedRate): number {
  return amount / rate.unitsPerEur;
}
