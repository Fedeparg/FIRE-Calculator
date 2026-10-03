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
import { roundCents } from "@sextante/core/money";

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

type RealisedGainsCsvColumn = (typeof REALISED_GAINS_CSV_COLUMNS)[number];

/** Cabeceras YA traducidas. */
export type RealisedGainsCsvHeaders = Readonly<Record<RealisedGainsCsvColumn, string>>;

/**
 * Cabeceras traducidas con el `t` del namespace `portfolio.realisedGains`: cada columna es la
 * clave `csv.<columna>`. Viven junto al CSV para que una columna nueva no se olvide en la UI.
 */
export function realisedGainsCsvHeaders(t: (key: `csv.${RealisedGainsCsvColumn}`) => string): RealisedGainsCsvHeaders {
  const headers = {} as Record<RealisedGainsCsvColumn, string>;
  for (const column of REALISED_GAINS_CSV_COLUMNS) headers[column] = t(`csv.${column}`);
  return headers;
}

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
    roundCents(sale.transferValue),
    roundCents(sale.acquisitionValue),
    roundCents(sale.gain),
    sale.eur?.sellRate.unitsPerEur ?? null,
    sale.eur ? roundCents(sale.eur.transferValue) : null,
    sale.eur ? roundCents(sale.eur.acquisitionValue) : null,
    sale.eur ? roundCents(sale.eur.gain) : null,
    sale.eur?.fxDifference != null ? roundCents(sale.eur.fxDifference) : null,
    sale.eur ? roundCents(sale.eur.deferredLoss) : null,
    sale.eur ? roundCents(sale.eur.integratedLoss) : null,
    sale.eur ? roundCents(sale.eur.computableGain) : null,
  ]);
  return buildCsv(
    REALISED_GAINS_CSV_COLUMNS.map((column) => headers[column]),
    rows,
    locale,
  );
}
