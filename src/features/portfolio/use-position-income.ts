"use client";

import type { IncomeEvent } from "@sextante/core/fiscal/income";
import { incomePath } from "@/features/portfolio/api";
import { useIncomeMutations } from "@/features/portfolio/use-income-mutations";
import { NO_STORE } from "@/shared/api/client";
import { useApiQuery } from "@/shared/api/use-api-query";

const NO_INCOME: IncomeEvent[] = [];

/**
 * A position's income (dividends) and its mutations, for the position panel. The list is reloaded
 * after every mutation; if that reload failed, the mutation was still saved.
 */
export function usePositionIncome(positionId: string) {
  const query = useApiQuery<IncomeEvent[]>(incomePath(positionId), { init: NO_STORE, keepPrevious: true });
  const mutations = useIncomeMutations(query.refetch);
  return {
    income: query.status === "ready" ? query.data : NO_INCOME,
    loadState: query.status,
    ...mutations,
  };
}
