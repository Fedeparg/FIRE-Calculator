// Los campos numéricos son `type="text"` + `inputMode="decimal"`: `<input type="number">`
// descarta la coma del teclado móvil en español. Se acepta coma y punto; el separador
// tecleado se conserva en pantalla y solo se normaliza al parsear.

const NOT_ALLOWED = /[^\d.,-]/g;
const SEPARATORS = /[.,]/g;
const HAS_DIGIT = /\d/;

/**
 * Deja dígitos, un único separador y un signo inicial; tolera estados intermedios ("3,", "-").
 * Con varios separadores manda el último (los previos son miles): vale "1.234,56" y "1,234.56".
 */
export function sanitizeDecimalInput(raw: string): string {
  const cleaned = raw.replace(NOT_ALLOWED, "");
  const negative = cleaned.startsWith("-");
  const unsigned = cleaned.replace(/-/g, "");

  const decimalAt = Math.max(unsigned.lastIndexOf(","), unsigned.lastIndexOf("."));
  const body =
    decimalAt === -1 ? unsigned : unsigned.slice(0, decimalAt).replace(SEPARATORS, "") + unsigned.slice(decimalAt);

  return negative ? `-${body}` : body;
}

/** `null` si aún no es un número ("", "-", ","); un separador final ("3,") vale 3. */
export function parseDecimalInput(raw: string): number | null {
  const normalized = sanitizeDecimalInput(raw).replace(",", ".");
  if (!HAS_DIGIT.test(normalized)) return null;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

// `String(n)` usa notación científica fuera de [1e-6, 1e21) y `sanitizeDecimalInput` la
// corrompería ("1e-7" -> "17"); `Intl` escribe siempre en notación posicional.
const PLAIN = new Intl.NumberFormat("en-US", { useGrouping: false, maximumFractionDigits: 20 });

/** Inversa de `parseDecimalInput`: decimal del idioma y sin separador de miles. */
export function formatDecimalInput(value: number, decimalSeparator: string): string {
  if (!Number.isFinite(value)) return "";
  if (value === 0) return "0"; // también captura el -0, que `Intl` escribiría "-0".
  return PLAIN.format(value).replace(".", decimalSeparator);
}

export function stripLeadingZeros(raw: string): string {
  return raw.replace(/^(-?)0+(?=\d)/, "$1");
}

export function clampNumber(value: number, min?: number, max?: number): number {
  if (min !== undefined && value < min) return min;
  if (max !== undefined && value > max) return max;
  return value;
}

function decimalsOf(value: number): number {
  const fraction = String(value).split(".")[1];
  return fraction ? fraction.length : 0;
}

/** Redondea a los decimales de los operandos: evita 0,1 + 0,2 = 0,30000000000000004. */
export function addStep(value: number, delta: number): number {
  const decimals = Math.max(decimalsOf(value), decimalsOf(delta));
  return Number((value + delta).toFixed(decimals));
}
