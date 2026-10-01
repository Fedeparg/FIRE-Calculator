// CSV puro (sin React ni DOM); la descarga está en `download.ts`.
// El dialecto va por idioma de la UI porque Excel usa el separador de listas del sistema:
// es -> `;` y coma decimal, en -> `,` y punto. Sin `sep=;` (otros parsers lo leen como dato).
// Los importes van sin separador de miles: "1.234,56" mal leído sería 1,23456.

import { formatDecimalInput } from "./number-input";
import type { Locale } from "@/i18n/types";

// BOM al descargar: sin él Excel lee en la página de códigos local y rompe acentos y €.
export const UTF8_BOM = "\uFEFF";

const LINE_BREAK = "\r\n";

const DIALECTS: Record<Locale, { delimiter: string; decimal: string }> = {
  es: { delimiter: ";", decimal: "," },
  en: { delimiter: ",", decimal: "." },
};

/** `null` (y los no finitos) salen vacíos, no como 0: "no lo sabemos" no es "vale cero". */
export type CsvCell = string | number | null;

// Evita la inyección de fórmulas (Excel ejecuta `=`, `+`, `-`, `@` iniciales). Solo en
// texto: en las numéricas rompería los importes negativos.
function escapeFormula(value: string): string {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

function quoteCell(value: string, delimiter: string): string {
  if (!value.includes(delimiter) && !/["\r\n]/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

/** Las cabeceras llegan ya traducidas: este módulo no traduce. */
export function buildCsv(headers: readonly string[], rows: readonly (readonly CsvCell[])[], locale: Locale): string {
  const { delimiter, decimal } = DIALECTS[locale];
  const cell = (value: CsvCell): string => {
    if (value === null) return "";
    // `formatDecimalInput` devuelve "" para los no finitos.
    if (typeof value === "number") return formatDecimalInput(value, decimal);
    return quoteCell(escapeFormula(value.trim()), delimiter);
  };
  const lines = [headers, ...rows].map((row) => row.map(cell).join(delimiter));
  return lines.join(LINE_BREAK) + LINE_BREAK;
}
