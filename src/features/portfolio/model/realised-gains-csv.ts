/**
 * CSV del informe de ganancias realizadas: una fila por VENTA del ejercicio, que es el nivel
 * de detalle que pide la declaración (cada transmisión con su valor de transmisión y de
 * adquisición). Los importes van en la divisa de la posición y en euros con el tipo del BCE del
 * día de la venta; sin ese tipo, las columnas en euros quedan vacías. Dialecto, escapado y BOM:
 * `src/shared/format/csv.ts`.
 */

import { buildCsv, type CsvCell } from "@/shared/format/csv";
import type { Locale } from "@/i18n/types";
import type { RealisedGainsYear } from "@sextante/core/fiscal/realised-gains";

/** Columnas del fichero, en orden. Es también el orden de `RealisedGainsCsvHeaders`. */
export const REALISED_GAINS_CSV_COLUMNS = [
  "date",
  "ticker",
  "name",
  "currency",
  "quantity",
  "price",
  "fees",
  "transferValue",
  "acquisitionValue",
  "gain",
  "exchangeRate",
  "transferValueEur",
  "acquisitionValueEur",
  "gainEur",
  "fxDifferenceEur",
  "deferredLossEur",
  "integratedLossEur",
  "computableGainEur",
] as const;

/** Cabeceras YA traducidas por quien llama. */
export type RealisedGainsCsvHeaders = Readonly<Record<(typeof REALISED_GAINS_CSV_COLUMNS)[number], string>>;

/** Importes calculados (prorrateos, restas): a céntimos, sin el ruido binario de la coma flotante. */
const cents = (value: number) => Math.round(value * 100) / 100;

export function buildRealisedGainsCsv(
  year: RealisedGainsYear,
  headers: RealisedGainsCsvHeaders,
  locale: Locale,
): string {
  const rows: CsvCell[][] = year.sales.map((sale) => [
    // Fecha en ISO: la reconocen todas las hojas de cálculo y ordena bien como texto.
    sale.tradedAt,
    sale.ticker,
    sale.name ?? "",
    sale.currency,
    sale.quantity,
    sale.price,
    sale.sellFees,
    cents(sale.transferValue),
    cents(sale.acquisitionValue),
    cents(sale.gain),
    sale.eur?.sellRate.unitsPerEur ?? null,
    sale.eur ? cents(sale.eur.transferValue) : null,
    sale.eur ? cents(sale.eur.acquisitionValue) : null,
    sale.eur ? cents(sale.eur.gain) : null,
    sale.eur?.fxDifference != null ? cents(sale.eur.fxDifference) : null,
    sale.eur ? cents(sale.eur.deferredLoss) : null,
    sale.eur ? cents(sale.eur.integratedLoss) : null,
    sale.eur ? cents(sale.eur.computableGain) : null,
  ]);
  return buildCsv(
    REALISED_GAINS_CSV_COLUMNS.map((column) => headers[column]),
    rows,
    locale,
  );
}
