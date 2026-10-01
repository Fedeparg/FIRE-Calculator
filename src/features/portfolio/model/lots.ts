// Traducción de los fallos de los endpoints de lotes a una clave de mensaje. Core puro
// (sin React), testeable.
//
// POR QUÉ NO SE MUESTRA EL `message` DE LA API: el backend devuelve `{ code, message }` con el
// texto redactado en castellano dentro de `lot-aggregate.ts`. Volcarlo en la interfaz dejaría
// esos errores SIN TRADUCIR en inglés (y acoplaría la UI a la redacción del servidor), así que
// aquí solo viaja el `code` y el texto sale de `messages/{es,en}.json` como todo lo demás.

import { ApiError, apiErrorKey, type ApiErrorKey } from "@/shared/api/client";

/** Clave de mensaje bajo `portfolio.lots.*` con la que explicar el fallo al usuario. */
export type LotErrorKey = ApiErrorKey | "errorNotFound" | "errorNegative" | "errorOverflow";

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
 * en el DTO). Sin `code`, un 400 se explica como "revisa los datos". El resto (sesión, red,
 * servidor) lo resuelve `apiErrorKey`; aquí solo se añaden el 403/404 y los códigos de dominio.
 */
export function lotErrorKey(error: unknown): LotErrorKey {
  if (error instanceof ApiError) {
    if (error.status === 403 || error.status === 404) return "errorNotFound";
    if (error.status === 400 && error.code && LOT_ERROR_CODES[error.code]) return LOT_ERROR_CODES[error.code];
  }
  return apiErrorKey(error);
}
