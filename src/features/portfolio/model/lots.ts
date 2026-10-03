// Fallos de los endpoints de lotes -> clave de mensaje. No se muestra el `message` de la
// API: está en castellano y quedaría sin traducir en inglés; solo viaja el `code`.

import type { PositionLot } from "@sextante/core/portfolio/types";
import { createApiErrorMapper } from "@/shared/api/client";

/**
 * Clave bajo `portfolio.lots.*`. Hay dos formas de 400: la de dominio (con `code`) y la de
 * validación (sin `code`, se explica como "revisa los datos"). El resto, el mapeo común.
 */
export const lotErrorKey = createApiErrorMapper({
  codes: { NEGATIVE_QUANTITY: "errorNegative", OVERFLOW: "errorOverflow", INVALID_DECIMAL: "errorInvalid" },
  statuses: { 404: "errorNotFound" },
  invalidFallback: "errorInvalid",
});

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
