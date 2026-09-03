/**
 * Exportación de la cartera a CSV. Core puro (sin React ni DOM): recibe los mismos datos que
 * ya tiene la pantalla (posiciones, últimos precios y tasas FX) y devuelve el texto del
 * fichero. La descarga (Blob + enlace) la hace el componente.
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

import { convertCurrency } from "./fx";
import { formatDecimalInput } from "./number-input";
import type { Locale } from "./types";

/** Marca de orden de bytes UTF-8. Se antepone al contenido al construir el fichero. */
export const UTF8_BOM = "\uFEFF";

/** Fin de línea de RFC 4180 (y el que espera Excel en Windows). */
const LINE_BREAK = "\r\n";

/** Separador de campos y separador decimal por idioma de la interfaz. */
const DIALECTS: Record<Locale, { delimiter: string; decimal: string }> = {
  es: { delimiter: ";", decimal: "," },
  en: { delimiter: ",", decimal: "." },
};

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
 * Neutraliza la inyección de fórmulas: una celda que empieza por `=`, `+`, `-` o `@` la
 * ejecuta Excel al abrir el fichero, y el nombre o el bróker son texto libre que el usuario
 * puede haber pegado de un extracto. Se aplica SOLO a las columnas de texto: hacerlo en las
 * numéricas rompería los importes negativos.
 */
function escapeFormula(value: string): string {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

/** Entrecomilla una celda si contiene el separador, comillas o un salto de línea (RFC 4180). */
function quoteCell(value: string, delimiter: string): string {
  if (!value.includes(delimiter) && !/["\r\n]/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

/** Celda de texto: primero se desactiva la fórmula, después se entrecomilla si hace falta. */
function textCell(value: string | null, delimiter: string): string {
  return quoteCell(escapeFormula(value?.trim() ?? ""), delimiter);
}

/**
 * Construye el CSV de la cartera. Una posición sin precio conocido, o cuyo precio no se puede
 * convertir a la divisa elegida, se exporta igualmente: solo quedan vacías las celdas que no
 * se pueden calcular (último precio y/o valoración).
 */
export function buildPortfolioCsv({
  positions,
  prices,
  rates,
  display,
  headers,
  locale,
}: PortfolioCsvInput): string {
  const { delimiter, decimal } = DIALECTS[locale];
  /**
   * Celda numérica: notación posicional con el separador decimal del idioma. Un valor no
   * calculable deja la celda VACÍA, nunca un 0, que se leería como "vale cero" en vez de "no
   * lo sabemos". (`formatDecimalInput` ya devuelve "" para los no finitos.)
   */
  const decimalCell = (value: number | null): string =>
    value === null ? "" : formatDecimalInput(value, decimal);

  const rows: string[] = [
    CSV_COLUMNS.map((column) => textCell(headers[column], delimiter)).join(delimiter),
  ];

  for (const position of positions) {
    const price = prices[position.ticker];
    const rawValue = price
      ? convertCurrency(position.quantity * price.close, price.currency, display, rates)
      : null;
    // La valoración es el ÚNICO importe calculado aquí (cantidad × precio y, encima, un
    // cambio de divisa): se redondea a céntimos para no volcar el ruido binario del coma
    // flotante ("1999,9999999999998") en una hoja de cálculo. El resto de importes salen tal
    // cual de la base de datos.
    const marketValue = rawValue === null ? null : Math.round(rawValue * 100) / 100;

    rows.push(
      [
        textCell(position.ticker, delimiter),
        textCell(position.name, delimiter),
        decimalCell(position.quantity),
        decimalCell(position.avgPrice),
        textCell(position.currency, delimiter),
        textCell(position.broker, delimiter),
        decimalCell(price ? price.close : null),
        textCell(price ? price.currency : null, delimiter),
        // Fecha en ISO (`YYYY-MM-DD`), no formateada al idioma: es la forma que cualquier
        // hoja de cálculo reconoce como fecha y la que ordena bien como texto.
        textCell(price ? price.date : null, delimiter),
        decimalCell(marketValue),
      ].join(delimiter),
    );
  }

  return rows.join(LINE_BREAK) + LINE_BREAK;
}
