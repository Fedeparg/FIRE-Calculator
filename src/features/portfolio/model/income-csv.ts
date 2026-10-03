/**
 * CSV of a tax year's income: one row per dividend, interest or reward, in its currency, with the
 * withholdings, whether it is already in the draft return and where each figure comes from.
 * Dialect, escaping and BOM: `src/shared/format/csv.ts`.
 */

import { compareStrings } from "@sextante/core/compare";
import { buildCsv, type CsvCell } from "@/shared/format/csv";
import type { Locale } from "@/i18n/types";
import type { IncomeEvent } from "@sextante/core/fiscal/income";

/** File columns, in order. */
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

/** Headers already translated. */
export type IncomeCsvHeaders = Readonly<Record<IncomeCsvColumn, string>>;

/** Key of each header in the `portfolio.income` namespace: the form's, or `csv.*` if there is no field. */
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

/** Headers and texts of the income CSV, using `t` from the `portfolio.income` namespace. */
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

/** Translated texts for the non-numeric values (type, source, yes/no). */
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
