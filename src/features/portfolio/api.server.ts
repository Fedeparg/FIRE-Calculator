import "server-only";

import { apiFetch } from "@/shared/api/api.server";
import type { ReferenceRates } from "@sextante/core/fiscal/fx-reference";
import { referenceRatesNeeded, type RealisedGainsPosition } from "@sextante/core/fiscal/realised-gains";
import type { Position, PositionLot } from "@sextante/core/portfolio/types";

import { toRealisedGainsPositions } from "@/features/portfolio/model/realised-gains-input";

/** Posiciones para el SSR inicial; `[]` ante cualquier fallo (la página ya está protegida). */
export async function fetchPositions(): Promise<Position[]> {
  return (await apiFetch<Position[]>("/api/positions")) ?? [];
}

/** Lo que necesita el informe de ganancias realizadas. */
export type RealisedGainsData = {
  positions: RealisedGainsPosition[];
  /** Tipos de referencia del BCE de las divisas con ventas (vacío si todo es en euros). */
  rates: ReferenceRates;
  /** `false` si hacían falta tipos y no se pudieron cargar: las ventas en divisa quedan sin convertir. */
  ratesLoaded: boolean;
};

/**
 * Posiciones con todas sus operaciones y los tipos del BCE que necesitan, para el informe de
 * plusvalías; `null` si falla la lectura de la cartera. No se disfraza de lista vacía: "no tienes
 * ventas" por un error sería un falso fiscal. Sin tipos, el informe sí sale y marca lo que no
 * pudo convertir.
 */
export async function fetchRealisedGainsData(): Promise<RealisedGainsData | null> {
  const [positions, lots] = await Promise.all([
    apiFetch<Position[]>("/api/positions"),
    apiFetch<PositionLot[]>("/api/positions/lots"),
  ]);
  if (!positions || !lots) return null;

  const input = toRealisedGainsPositions(positions, lots);
  const needed = referenceRatesNeeded(input);
  if (!needed) return { positions: input, rates: {}, ratesLoaded: true };

  const query = new URLSearchParams({ currencies: needed.currencies.join(","), from: needed.from });
  const rates = await apiFetch<ReferenceRates>(`/api/fx/reference-rates?${query.toString()}`);
  return { positions: input, rates: rates ?? {}, ratesLoaded: rates !== null };
}
