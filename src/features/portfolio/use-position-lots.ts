"use client";

import { lotErrorKey } from "@/features/portfolio/model/lots";
import type { LotPayload, PositionLot } from "@sextante/core/portfolio/types";
import { deleteLot, lotsPath, saveLot } from "@/features/portfolio/api";
import { NO_STORE } from "@/shared/api/client";
import { useApiMutation } from "@/shared/api/use-api-mutation";
import { useApiQuery } from "@/shared/api/use-api-query";

const NO_LOTS: PositionLot[] = [];

/**
 * A position's lots (the full film: every purchase and every sale) and their mutations.
 *
 * `onMutated` (required) is called after EVERY mutation: the backend rewrites the position's
 * `quantity` and `avgPrice` in the same transaction, so without it the list and the total would
 * keep showing the previous snapshot. The history is reloaded afterwards; if that reload fails,
 * the mutation HAS been saved and `loadState` becomes `error`: it is a stale view, not a failed
 * operation.
 *
 * Only the error body's `code` is used (`lotErrorKey`): the backend's `message` is in Spanish,
 * and breaking the English translation to show it would be worse than a slightly more generic
 * but translated message.
 */
export function usePositionLots(positionId: string, onMutated: () => void) {
  // `keepPrevious`: when reloading after a mutation, the current lots stay on screen.
  const query = useApiQuery<PositionLot[]>(lotsPath(positionId), { init: NO_STORE, keepPrevious: true });
  const { refetch } = query;
  const mutation = useApiMutation();

  async function mutate(request: () => Promise<unknown>): Promise<boolean> {
    const result = await mutation.run(request);
    if (!result.ok) return false;
    onMutated();
    refetch();
    return true;
  }

  return {
    lots: query.status === "ready" ? query.data : NO_LOTS,
    loadState: query.status,
    errorKey: mutation.error === null ? null : lotErrorKey(mutation.error),
    submitting: mutation.status === "pending",
    /** Creates (`lotId === null`) or edits. `true` if the API accepted it. */
    save: (lotId: string | null, payload: LotPayload) => mutate(() => saveLot(positionId, lotId, payload)),
    remove: (lotId: string) => mutate(() => deleteLot(positionId, lotId)),
  };
}
