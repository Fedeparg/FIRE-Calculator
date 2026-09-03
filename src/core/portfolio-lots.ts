// Traducción de los fallos de los endpoints de lotes a una clave de mensaje. Core puro
// (sin React), testeable.
//
// POR QUÉ NO SE MUESTRA EL `message` DE LA API: el backend devuelve `{ code, message }` con el
// texto redactado en castellano dentro de `lot-aggregate.ts`. Volcarlo en la interfaz dejaría
// esos errores SIN TRADUCIR en inglés (y acoplaría la UI a la redacción del servidor), así que
// aquí solo viaja el `code` y el texto sale de `messages/{es,en}.json` como todo lo demás.

/** Clave de mensaje bajo `portfolio.lots.*` con la que explicar el fallo al usuario. */
export type LotErrorKey =
  | "errorNetwork"
  | "errorSession"
  | "errorNotFound"
  | "errorNegative"
  | "errorOverflow"
  | "errorInvalid"
  | "errorServer"
  | "errorGeneric";

/** Códigos de error de dominio que emite la agregación de lotes del backend. */
const LOT_ERROR_CODES: Record<string, LotErrorKey> = {
  NEGATIVE_QUANTITY: "errorNegative",
  OVERFLOW: "errorOverflow",
  INVALID_DECIMAL: "errorInvalid",
};

/**
 * Devuelve la clave de mensaje para un fallo de la API de lotes.
 *
 * Hay dos formas distintas de 400 y las dos hay que cubrirlas: la del dominio, que trae
 * `code` (una venta que dejaría la posición en negativo, un desbordamiento), y la del
 * `ValidationPipe` global, que NO trae `code` (una fecha mal formada, un campo no declarado
 * en el DTO). Sin `code`, un 400 se explica como "revisa los datos".
 */
export function lotErrorKey(status: number, code?: string): LotErrorKey {
  if (status === 401) return "errorSession";
  if (status === 403 || status === 404) return "errorNotFound";
  if (status === 400) return (code && LOT_ERROR_CODES[code]) || "errorInvalid";
  if (status >= 500) return "errorServer";
  return "errorGeneric";
}
