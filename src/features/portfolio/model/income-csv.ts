/**
 * CSV de los cobros de un ejercicio: una fila por dividendo, interés o recompensa, en su divisa,
 * con las retenciones, si ya está en el borrador y de dónde sale cada cifra. Dialecto, escapado y
 * BOM: `src/shared/format/csv.ts`.
 */

import { compareStrings } from "@sextante/core/compare";
import { buildCsv, type CsvCell } from "@/shared/format/csv";
import type { Locale } from "@/i18n/types";
import type { IncomeEvent } from "@sextante/core/fiscal/income";

/** Columnas del fichero, en orden. */
export const INCOME_CSV_COLUMNS = [
  "date",
  "kind",
  "name",
  "isin",
  "country",
  "currency",
  "gross",
  "withholdingOrigin",
  "withholdingSpain",
  "reportedToAeat",
  "grossSource",
  "withholdingOriginSource",
] as const;

type IncomeCsvColumn = (typeof INCOME_CSV_COLUMNS)[number];

/** Cabeceras ya traducidas. */
export type IncomeCsvHeaders = Readonly<Record<IncomeCsvColumn, string>>;

/** Clave de cada cabecera en el namespace `portfolio.income`: las del formulario, o `csv.*` si no hay campo. */
const INCOME_CSV_HEADER_KEYS: Readonly<Record<IncomeCsvColumn, string>> = {
  date: "csv.date",
  kind: "kind",
  name: "name",
  isin: "isin",
  country: "country",
  currency: "currency",
  gross: "gross",
  withholdingOrigin: "withholdingOrigin",
  withholdingSpain: "withholdingSpain",
  reportedToAeat: "csv.reportedToAeat",
  grossSource: "csv.grossSource",
  withholdingOriginSource: "csv.withholdingOriginSource",
};

/** Cabeceras y textos del CSV de cobros con el `t` del namespace `portfolio.income`. */
export function incomeCsvTexts(t: (key: string) => string): { headers: IncomeCsvHeaders; labels: IncomeCsvLabels } {
  const headers = {} as Record<IncomeCsvColumn, string>;
  for (const column of INCOME_CSV_COLUMNS) headers[column] = t(INCOME_CSV_HEADER_KEYS[column]);
  return {
    headers,
    labels: {
      kind: (kind) => t(`kinds.${kind}`),
      source: (source) => t(`sources.${source}`),
      yes: t("csv.yes"),
      no: t("csv.no"),
    },
  };
}

/** Textos traducidos de los valores que no son números (tipo, procedencia, sí/no). */
export type IncomeCsvLabels = {
  kind: (kind: IncomeEvent["kind"]) => string;
  source: (source: NonNullable<IncomeEvent["withholdingOriginSource"]>) => string;
  yes: string;
  no: string;
};

export function buildIncomeCsv(
  events: readonly IncomeEvent[],
  headers: IncomeCsvHeaders,
  labels: IncomeCsvLabels,
  locale: Locale,
): string {
  const rows: CsvCell[][] = [...events]
    .sort((a, b) => compareStrings(a.paidAt, b.paidAt))
    .map((event) => [
      event.paidAt,
      labels.kind(event.kind),
      event.name ?? "",
      event.isin ?? "",
      event.country ?? "",
      event.currency,
      event.gross,
      event.withholdingOrigin,
      event.withholdingSpain,
      event.reportedToAeat ? labels.yes : labels.no,
      labels.source(event.grossSource),
      event.withholdingOriginSource ? labels.source(event.withholdingOriginSource) : "",
    ]);
  return buildCsv(
    INCOME_CSV_COLUMNS.map((column) => headers[column]),
    rows,
    locale,
  );
}
