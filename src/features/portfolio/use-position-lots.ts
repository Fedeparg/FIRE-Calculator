"use client";

import { lotErrorKey } from "@/features/portfolio/model/lots";
import type { LotPayload, PositionLot } from "@sextante/core/portfolio/types";
import { deleteLot, lotsPath, saveLot } from "@/features/portfolio/api";
import { NO_STORE } from "@/shared/api/client";
import { useApiMutation } from "@/shared/api/use-api-mutation";
import { useApiQuery } from "@/shared/api/use-api-query";

const NO_LOTS: PositionLot[] = [];

/**
 * Lotes de una posición (la película: cada compra y cada venta) y sus mutaciones.
 *
 * Tras CADA mutación se llama a `onMutated` (obligatorio): el backend reescribe `quantity` y
 * `avgPrice` de la posición en la misma transacción, así que sin él la lista y el total
 * seguirían mostrando la foto anterior. Después se recarga el histórico; si esa recarga
 * fallase, la mutación SÍ se ha guardado y `loadState` pasa a `error`: es una vista desfasada,
 * no una operación fallida.
 *
 * Solo viaja el `code` del cuerpo de error (`lotErrorKey`): el `message` del backend está en
 * castellano y romper la traducción en inglés por mostrarlo sería peor que un mensaje algo
 * más genérico pero traducido.
 */
export function usePositionLots(positionId: string, onMutated: () => void) {
  // `keepPrevious`: al recargar tras una mutación se siguen enseñando los lotes actuales.
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
    /** Alta (`lotId === null`) o edición. `true` si la API lo aceptó. */
    save: (lotId: string | null, payload: LotPayload) => mutate(() => saveLot(positionId, lotId, payload)),
    remove: (lotId: string) => mutate(() => deleteLot(positionId, lotId)),
  };
}
