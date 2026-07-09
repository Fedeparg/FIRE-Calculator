/**
 * Parseo de lo que el usuario teclea en un campo numérico.
 *
 * En móvil, el teclado decimal usa el separador del idioma del dispositivo: en
 * español, la coma. Un `<input type="number">` descarta cualquier contenido que
 * no sea un "valid floating-point number" del HTML —que solo admite el punto—,
 * así que la coma nunca llega al handler y el usuario no puede escribir
 * decimales. Por eso los campos numéricos son `type="text"` + `inputMode="decimal"`
 * y la conversión a número vive aquí.
 *
 * Se acepta indistintamente coma y punto: el separador que escribe el usuario se
 * conserva en el texto visible y solo se normaliza al parsear.
 */

const NOT_ALLOWED = /[^\d.,-]/g;
const SEPARATORS = /[.,]/g;
const HAS_DIGIT = /\d/;

/**
 * Deja solo lo que puede formar un decimal: dígitos, un único separador (el que
 * haya escrito el usuario) y un signo negativo al principio. Se aplica en cada
 * pulsación, así que debe tolerar estados intermedios ("3,", "-", ",").
 *
 * Con varios separadores manda el último, y los anteriores se tratan como
 * separadores de miles. Así un valor pegado desde fuera se interpreta bien tanto
 * en formato español ("1.234,56") como inglés ("1,234.56").
 */
export function sanitizeDecimalInput(raw: string): string {
  const cleaned = raw.replace(NOT_ALLOWED, "");
  const negative = cleaned.startsWith("-");
  const unsigned = cleaned.replace(/-/g, "");

  const decimalAt = Math.max(unsigned.lastIndexOf(","), unsigned.lastIndexOf("."));
  const body =
    decimalAt === -1
      ? unsigned
      : unsigned.slice(0, decimalAt).replace(SEPARATORS, "") + unsigned.slice(decimalAt);

  return negative ? `-${body}` : body;
}

/**
 * Convierte la entrada a número, o `null` si todavía no representa uno
 * ("", "-", ",", "-."). Un separador final ("3,") sí es número: vale 3.
 */
export function parseDecimalInput(raw: string): number | null {
  const normalized = sanitizeDecimalInput(raw).replace(",", ".");
  if (!HAS_DIGIT.test(normalized)) return null;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

// `String(n)` recurre a la notación científica fuera de [1e-6, 1e21) ("1e-7", "1e+21"), y ese
// texto, al volver a pasar por `sanitizeDecimalInput`, perdería la "e" y se corrompería
// ("1e-7" → "17"). Basta teclear siete decimales para llegar ahí, así que se formatea con
// `Intl`, que siempre escribe el número en notación posicional.
const PLAIN = new Intl.NumberFormat("en-US", { useGrouping: false, maximumFractionDigits: 20 });

/**
 * Escribe un número tal y como debe verse *dentro del campo* mientras se edita: con
 * el separador decimal del idioma y sin separador de miles (que estorbaría al seguir
 * tecleando). Es la operación inversa de `parseDecimalInput`.
 */
export function formatDecimalInput(value: number, decimalSeparator: string): string {
  if (!Number.isFinite(value)) return "";
  if (value === 0) return "0"; // también captura el -0, que `Intl` escribiría "-0".
  return PLAIN.format(value).replace(".", decimalSeparator);
}

/** Quita ceros a la izquierda ("0300" → "300") conservando "0" y "0,5". */
export function stripLeadingZeros(raw: string): string {
  return raw.replace(/^(-?)0+(?=\d)/, "$1");
}

/** Acota `value` al rango, ignorando los extremos no definidos. */
export function clampNumber(value: number, min?: number, max?: number): number {
  if (min !== undefined && value < min) return min;
  if (max !== undefined && value > max) return max;
  return value;
}

function decimalsOf(value: number): number {
  const fraction = String(value).split(".")[1];
  return fraction ? fraction.length : 0;
}

/**
 * Suma `delta` redondeando a los decimales de los operandos, para que las
 * flechas del teclado no arrastren el ruido binario (0,1 + 0,2 → 0,30000000000000004).
 */
export function addStep(value: number, delta: number): number {
  const decimals = Math.max(decimalsOf(value), decimalsOf(delta));
  return Number((value + delta).toFixed(decimals));
}
