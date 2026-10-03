// Política de entradas numéricas de las calculadoras. Core puro.
//
//   1. Una calculadora NUNCA lanza ni se cuelga, sea cual sea la entrada numérica (NaN, ±Infinity,
//      negativos, ceros). Las entradas llegan de formularios, de URLs compartidas y del MCP; un
//      fallo aquí rompería la página entera.
//   2. Con entradas finitas (incluidos ceros y negativos) toda cifra de salida es finita. Lo que no
//      tiene respuesta se expresa con `null` (p. ej. `yearsToFire`) o con el resultado documentado
//      de la calculadora (la deuda de tarjeta que nunca se paga devuelve intereses `Infinity`).
//   3. Con entradas no finitas la salida puede ser no finita: la web la pinta como «—»
//      (`shared/format/format.ts`). El MCP ya las rechaza antes de llegar aquí (zod `z.number()` con
//      topes), y los formularios acotan cada campo.
//   4. Los campos de plazo se acotan a `MAX_HORIZON_YEARS`: sin tope, `years = Infinity` (o 1e9)
//      haría un bucle sin fin construyendo una serie de ese tamaño.
//
// Tests: `edge-inputs.test.ts` comprueba 1 y 2 sobre todas las calculadoras.

/** Tope de los campos de plazo, en años; el mismo que el MCP aplica por defecto. */
export const MAX_HORIZON_YEARS = 100;

/**
 * Plazo en años como entero de `min` a `MAX_HORIZON_YEARS`. NaN cuenta como 0 (como el resto de
 * entradas: `x || 0`); ±Infinity se acota al extremo correspondiente.
 */
export function clampYears(years: number | undefined, min = 0): number {
  return Math.min(MAX_HORIZON_YEARS, Math.max(min, Math.round(years || 0)));
}

/**
 * Tolerancia de cantidades (participaciones): se guardan con 6 decimales, así que un resto menor
 * es ruido binario de la coma flotante y cuenta como cero.
 */
export const QUANTITY_EPSILON = 1e-9;

/** `value` si es finito; si no (NaN, ±Infinity), `fallback`. */
export function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

/** `value` si es finito y positivo; cualquier otra cosa (negativos, cero, NaN, ±Infinity) da 0. */
export function nonNegative(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}
