"use client";

import type { IncomePayload } from "@sextante/core/fiscal/income";
import { deleteIncome, saveIncome } from "@/features/portfolio/api";
import { useApiMutation } from "@/shared/api/use-api-mutation";

/**
 * Alta, edición y borrado de cobros; `onMutated` resincroniza quien los muestra (el panel de la
 * posición recarga su lista, la Declaración refresca la página). Lo usan los dos sitios, por eso
 * no vive en `use-position-income.ts`.
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
    /** Alta (`incomeId === null`) o edición. `true` si la API lo aceptó. */
    save: (incomeId: string | null, payload: IncomePayload) => mutate(() => saveIncome(incomeId, payload)),
    remove: (incomeId: string) => mutate(() => deleteIncome(incomeId)),
  };
}
