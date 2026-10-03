/**
 * Exportación de la cartera a CSV. Core puro (sin React ni DOM): recibe los mismos datos que
 * ya tiene la pantalla (posiciones, últimos precios y tasas FX) y devuelve el texto del
 * fichero. El dialecto, el escapado y el BOM son los de `src/shared/format/csv.ts`.
 */

import { buildCsv, type CsvCell } from "@/shared/format/csv";
import { convertCurrency } from "@sextante/core/fx";
import type { Locale } from "@/i18n/types";
import { roundCents } from "@sextante/core/money";

/** Columnas del fichero, en orden. Es también el orden de `PortfolioCsvHeaders`. */
export const CSV_COLUMNS = [
  "ticker",
  "name",
  "quantity",
  "avgPrice",
  "currency",
  "broker",
  "lastPrice",
  "priceCurrency",
  "priceDate",
  "marketValue",
] as const;

/** Cabeceras YA traducidas por quien llama: el core no traduce (mismo criterio que el resto). */
export type PortfolioCsvHeaders = Readonly<Record<(typeof CSV_COLUMNS)[number], string>>;

export interface PortfolioCsvInput {
  positions: readonly {
    ticker: string;
    name: string | null;
    quantity: number;
    avgPrice: number;
    broker: string | null;
    currency: string;
  }[];
  /** Último precio por ticker, cada uno en su divisa nativa. */
  prices: Record<string, { close: number; currency: string; date: string }>;
  /** USD por unidad de cada divisa (USD = 1). */
  rates: Record<string, number>;
  /** Divisa en la que se expresa la valoración (la elegida en la cartera). */
  display: string;
  headers: PortfolioCsvHeaders;
  locale: Locale;
}

/**
 * Construye el CSV de la cartera. Una posición sin precio conocido, o cuyo precio no se puede
 * convertir a la divisa elegida, se exporta igualmente: solo quedan vacías las celdas que no
 * se pueden calcular (último precio y/o valoración).
 */
export function buildPortfolioCsv({ positions, prices, rates, display, headers, locale }: PortfolioCsvInput): string {
  const rows: CsvCell[][] = positions.map((position) => {
    const price = prices[position.ticker];
    const rawValue = price ? convertCurrency(position.quantity * price.close, price.currency, display, rates) : null;
    // La valoración es el ÚNICO importe calculado aquí (cantidad × precio y, encima, un
    // cambio de divisa): se redondea a céntimos para no volcar el ruido binario del coma
    // flotante ("1999,9999999999998") en una hoja de cálculo. El resto de importes salen tal
    // cual de la base de datos.
    const marketValue = rawValue === null ? null : roundCents(rawValue);

    return [
      position.ticker,
      position.name ?? "",
      position.quantity,
      position.avgPrice,
      position.currency,
      position.broker ?? "",
      price ? price.close : null,
      price ? price.currency : "",
      // Fecha en ISO (`YYYY-MM-DD`), no formateada al idioma: es la forma que cualquier
      // hoja de cálculo reconoce como fecha y la que ordena bien como texto.
      price ? price.date : "",
      marketValue,
    ];
  });

  return buildCsv(
    CSV_COLUMNS.map((column) => headers[column]),
    rows,
    locale,
  );
}
