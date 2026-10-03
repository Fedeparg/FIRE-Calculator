// Pure CSV (no React or DOM); the download lives in `download.ts`.
// The dialect follows the UI locale because Excel uses the system list separator:
// es -> `;` and decimal comma, en -> `,` and decimal point. No `sep=;` (other parsers read it as
// data). Amounts have no thousands separator: "1.234,56" misread would become 1.23456.

import { formatDecimalInput } from "./number-input";
import type { Locale } from "@/i18n/types";

// BOM on download: without it Excel reads the local code page and mangles accents and €.
export const UTF8_BOM = "\uFEFF";

const LINE_BREAK = "\r\n";

const DIALECTS: Record<Locale, { delimiter: string; decimal: string }> = {
  es: { delimiter: ";", decimal: "," },
  en: { delimiter: ",", decimal: "." },
};

/** `null` (and non-finite numbers) are written empty, not as 0: "unknown" is not "zero". */
export type CsvCell = string | number | null;

// Prevents formula injection (Excel evaluates a leading `=`, `+`, `-`, `@`). Text cells only:
// on numeric cells it would break negative amounts.
function escapeFormula(value: string): string {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

function quoteCell(value: string, delimiter: string): string {
  if (!value.includes(delimiter) && !/["\r\n]/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

/** Headers arrive already translated: this module does not translate. */
export function buildCsv(headers: readonly string[], rows: readonly (readonly CsvCell[])[], locale: Locale): string {
  const { delimiter, decimal } = DIALECTS[locale];
  const cell = (value: CsvCell): string => {
    if (value === null) return "";
    // `formatDecimalInput` returns "" for non-finite numbers.
    if (typeof value === "number") return formatDecimalInput(value, decimal);
    return quoteCell(escapeFormula(value.trim()), delimiter);
  };
  const lines = [headers, ...rows].map((row) => row.map(cell).join(delimiter));
  return lines.join(LINE_BREAK) + LINE_BREAK;
}
