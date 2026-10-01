/**
 * Construcción de ficheros CSV para Excel y compañía. Core puro (sin React ni DOM): recibe
 * cabeceras ya traducidas y filas de celdas, y devuelve el texto. La descarga (Blob + enlace)
 * la hace `lib/download.ts`.
 *
 * **Dialecto según el idioma, por Excel.** Excel no lee el CSV con un dialecto fijo: usa el
 * separador de listas del sistema, que en un Windows/macOS en español es `;` y el decimal es
 * la coma; en inglés son `,` y el punto. Un fichero con comas y puntos abierto en un Excel
 * español mete toda la fila en una celda y lee "1234.56" como texto. Por eso el dialecto se
 * elige por idioma de la UI (`es` → `;` y coma; `en` → `,` y punto), que es el mismo criterio
 * con el que ya se formatean los números en pantalla (`core/format.ts`).
 *
 * No se emite la línea `sep=;` (una extensión de Microsoft que Excel entiende, pero que
 * cualquier otro parser —pandas, Numbers, Google Sheets— lee como una fila de datos). Sí se
 * antepone un BOM UTF-8 al descargar (`UTF8_BOM`): sin él, Excel interpreta el fichero en la
 * página de códigos local y destroza los acentos y el símbolo del euro.
 *
 * Los importes van SIN separador de miles: es redundante en un fichero de datos y, con el
 * dialecto español, un "1.234,56" mal leído por otra herramienta se convertiría en 1,23456.
 */

import { formatDecimalInput } from "./number-input";
import type { Locale } from "@/core/types";

/** Marca de orden de bytes UTF-8. Se antepone al contenido al construir el fichero. */
export const UTF8_BOM = "\uFEFF";

/** Fin de línea de RFC 4180 (y el que espera Excel en Windows). */
const LINE_BREAK = "\r\n";

/** Separador de campos y separador decimal por idioma de la interfaz. */
const DIALECTS: Record<Locale, { delimiter: string; decimal: string }> = {
  es: { delimiter: ";", decimal: "," },
  en: { delimiter: ",", decimal: "." },
};

/**
 * Una celda: texto (`string`), número (`number`, con el decimal del idioma) o vacía (`null`).
 * Un valor que no se puede calcular va como `null`, nunca como 0: una celda con 0 se leería
 * como "vale cero" en vez de "no lo sabemos". Los números no finitos también salen vacíos.
 */
export type CsvCell = string | number | null;

/**
 * Neutraliza la inyección de fórmulas: una celda que empieza por `=`, `+`, `-` o `@` la
 * ejecuta Excel al abrir el fichero, y los textos (nombres, brókers) son texto libre que el
 * usuario puede haber pegado de un extracto. Se aplica SOLO a las celdas de texto: hacerlo en
 * las numéricas rompería los importes negativos.
 */
function escapeFormula(value: string): string {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

/** Entrecomilla una celda si contiene el separador, comillas o un salto de línea (RFC 4180). */
function quoteCell(value: string, delimiter: string): string {
  if (!value.includes(delimiter) && !/["\r\n]/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

/**
 * Construye el CSV: una fila de cabeceras y una por cada elemento de `rows`, con el dialecto
 * del idioma. Las cabeceras llegan YA traducidas: el core no traduce.
 */
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
