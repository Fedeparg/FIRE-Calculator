"use client";

import { useState } from "react";

import type { IncomeEvent, IncomePayload } from "@sextante/core/fiscal/income";
import { deleteIncome, incomePath, saveIncome } from "@/features/portfolio/api";
import { apiErrorKey, NO_STORE, type ApiErrorKey } from "@/shared/api/client";
import { useApiQuery } from "@/shared/api/use-api-query";

const NO_INCOME: IncomeEvent[] = [];

/**
 * Cobros de una posición (dividendos) y sus mutaciones, para el panel de la posición. Tras cada
 * mutación se recarga la lista; si la recarga fallase, la mutación sí se guardó.
 */
export function usePositionIncome(positionId: string) {
  const query = useApiQuery<IncomeEvent[]>(incomePath(positionId), { init: NO_STORE, keepPrevious: true });
  const { refetch } = query;
  const mutations = useIncomeMutations(refetch);
  return {
    income: query.status === "ready" ? query.data : NO_INCOME,
    loadState: query.status,
    ...mutations,
  };
}

/** Alta, edición y borrado de cobros; `onMutated` resincroniza quien los muestra. */
export function useIncomeMutations(onMutated: () => void) {
  const [submitting, setSubmitting] = useState(false);
  const [errorKey, setErrorKey] = useState<ApiErrorKey | null>(null);

  async function mutate(request: () => Promise<unknown>): Promise<boolean> {
    setSubmitting(true);
    setErrorKey(null);
    try {
      await request();
    } catch (error) {
      setErrorKey(apiErrorKey(error));
      return false;
    } finally {
      setSubmitting(false);
    }
    onMutated();
    return true;
  }

  return {
    submitting,
    errorKey,
    /** Alta (`incomeId === null`) o edición. `true` si la API lo aceptó. */
    save: (incomeId: string | null, payload: IncomePayload) => mutate(() => saveIncome(incomeId, payload)),
    remove: (incomeId: string) => mutate(() => deleteIncome(incomeId)),
  };
}
