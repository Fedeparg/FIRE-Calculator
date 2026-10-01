// Fallos de los endpoints de lotes -> clave de mensaje. No se muestra el `message` de la
// API: está en castellano y quedaría sin traducir en inglés; solo viaja el `code`.

import { ApiError, apiErrorKey, type ApiErrorKey } from "@/shared/api/client";

/** Clave bajo `portfolio.lots.*`. */
export type LotErrorKey = ApiErrorKey | "errorNotFound" | "errorNegative" | "errorOverflow";

const LOT_ERROR_CODES: Record<string, LotErrorKey> = {
  NEGATIVE_QUANTITY: "errorNegative",
  OVERFLOW: "errorOverflow",
  INVALID_DECIMAL: "errorInvalid",
};

/**
 * Hay dos formas de 400: la de dominio (con `code`) y la del `ValidationPipe` global (sin
 * `code`, se explica como "revisa los datos"). El resto lo resuelve `apiErrorKey`.
 */
export function lotErrorKey(error: unknown): LotErrorKey {
  if (error instanceof ApiError) {
    if (error.status === 403 || error.status === 404) return "errorNotFound";
    if (error.status === 400 && error.code && LOT_ERROR_CODES[error.code]) return LOT_ERROR_CODES[error.code];
  }
  return apiErrorKey(error);
}
