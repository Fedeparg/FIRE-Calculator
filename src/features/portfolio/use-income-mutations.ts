"use client";

import type { IncomePayload } from "@sextante/core/fiscal/income";
import { deleteIncome, saveIncome } from "@/features/portfolio/api";
import { useApiMutation } from "@/shared/api/use-api-mutation";

/**
 * Creating, editing and deleting income; `onMutated` re-syncs whoever displays it (the position
 * panel reloads its list, the tax return refreshes the page). Both places use it, which is why it
 * does not live in `use-position-income.ts`.
 */
export function useIncomeMutations(onMutated: () => void) {
  const mutation = useApiMutation();

  async function mutate(request: () => Promise<unknown>): Promise<boolean> {
    const result = await mutation.run(request);
    if (result.ok) onMutated();
    return result.ok;
  }

  return {
    submitting: mutation.status === "pending",
    errorKey: mutation.errorKey,
    /** Creates (`incomeId === null`) or edits. `true` if the API accepted it. */
    save: (incomeId: string | null, payload: IncomePayload) => mutate(() => saveIncome(incomeId, payload)),
    remove: (incomeId: string) => mutate(() => deleteIncome(incomeId)),
  };
}
