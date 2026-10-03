// Fallos de los endpoints de lotes -> clave de mensaje. No se muestra el `message` de la
// API: está en castellano y quedaría sin traducir en inglés; solo viaja el `code`.

import type { PositionLot } from "@sextante/core/portfolio/types";
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
    if (error.status === 404) return "errorNotFound";
    if (error.status === 400 && error.code && LOT_ERROR_CODES[error.code]) return LOT_ERROR_CODES[error.code];
  }
  return apiErrorKey(error);
}

/**
 * ¿Tiene ventas la posición? `null` si aún no se sabe (lotes cargando o con error): quien lo use
 * debe tratar `null` como "puede que sí", porque borrar una posición con ventas las quita del
 * informe de plusvalías y ese aviso no puede perderse por una carga lenta o fallida.
 */
export function positionHasSales(
  loadState: "loading" | "ready" | "error",
  lots: readonly PositionLot[],
): boolean | null {
  return loadState === "ready" ? lots.some((lot) => lot.kind === "sell") : null;
}
