// Lot endpoint failures -> message key. The API's `message` is not shown: it is in Spanish
// and would stay untranslated in English; only the `code` is used.

import type { PositionLot } from "@sextante/core/portfolio/types";
import { createApiErrorMapper } from "@/shared/api/client";

/**
 * Key under `portfolio.lots.*`. There are two kinds of 400: the domain one (with `code`) and the
 * validation one (no `code`, explained as "check the data"). Everything else uses the common mapping.
 */
export const lotErrorKey = createApiErrorMapper({
  codes: { NEGATIVE_QUANTITY: "errorNegative", OVERFLOW: "errorOverflow", INVALID_DECIMAL: "errorInvalid" },
  statuses: { 404: "errorNotFound" },
  invalidFallback: "errorInvalid",
});

/**
 * Does the position have sales? `null` if it is not known yet (lots loading or failed): callers
 * must treat `null` as "maybe", because deleting a position with sales removes them from the
 * capital gains report, and that warning must not be lost to a slow or failed load.
 */
export function positionHasSales(
  loadState: "loading" | "ready" | "error",
  lots: readonly PositionLot[],
): boolean | null {
  return loadState === "ready" ? lots.some((lot) => lot.kind === "sell") : null;
}
