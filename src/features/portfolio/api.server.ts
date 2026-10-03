import "server-only";

import { apiFetch } from "@/shared/api/api.server";
import type { ReferenceRates } from "@sextante/core/fiscal/fx-reference";
import { incomeRatesNeeded, type IncomeEvent } from "@sextante/core/fiscal/income";
import type { PendingNegative } from "@sextante/core/fiscal/savings-base";
import { referenceRatesNeeded, type RealisedGainsPosition } from "@sextante/core/fiscal/realised-gains";
import type { AssetClass, Position, PositionLot } from "@sextante/core/portfolio/types";

import { toRealisedGainsPositions } from "@/features/portfolio/model/realised-gains-input";

/** Posiciones para el SSR inicial; `[]` ante cualquier fallo (la página ya está protegida). */
export async function fetchPositions(): Promise<Position[]> {
  return (await apiFetch<Position[]>("/api/positions")) ?? [];
}

/** Lo que necesita el informe fiscal: ventas y cobros. */
export type RealisedGainsData = {
  positions: RealisedGainsPosition[];
  income: IncomeEvent[];
  /** Saldos negativos pendientes de años que Sextante no calcula. */
  pendingBalances: PendingNegative[];
  /** Clase de activo de cada posición: decide el bloque de la declaración de sus ventas. */
  assetClasses: Record<string, AssetClass | null>;
  /** Tipos de referencia del BCE de las divisas con ventas o cobros (vacío si todo es en euros). */
  rates: ReferenceRates;
  /** `false` si hacían falta tipos y no se pudieron cargar: las ventas en divisa quedan sin convertir. */
  ratesLoaded: boolean;
};

/**
 * Posiciones con todas sus operaciones, los cobros y los tipos del BCE que necesitan, para el
 * informe fiscal; `null` si falla la lectura de la cartera. No se disfraza de lista vacía: "no tienes
 * ventas" por un error sería un falso fiscal. Sin tipos, el informe sí sale y marca lo que no
 * pudo convertir.
 */
export async function fetchRealisedGainsData(): Promise<RealisedGainsData | null> {
  const [positions, lots, income, pendingBalances] = await Promise.all([
    apiFetch<Position[]>("/api/positions"),
    apiFetch<PositionLot[]>("/api/positions/lots"),
    apiFetch<IncomeEvent[]>("/api/income"),
    apiFetch<PendingNegative[]>("/api/tax-return/pending-balances"),
  ]);
  if (!positions || !lots || !income || !pendingBalances) return null;

  const input = toRealisedGainsPositions(positions, lots);
  const assetClasses = Object.fromEntries(positions.map((p) => [p.id, p.assetClass]));
  const needed = [referenceRatesNeeded(input), incomeRatesNeeded(income)].filter((n) => n !== null);
  if (needed.length === 0)
    return { positions: input, income, pendingBalances, assetClasses, rates: {}, ratesLoaded: true };

  const currencies = [...new Set(needed.flatMap((n) => n.currencies))].sort();
  const from = needed.map((n) => n.from).sort()[0];
  const query = new URLSearchParams({ currencies: currencies.join(","), from });
  const rates = await apiFetch<ReferenceRates>(`/api/fx/reference-rates?${query.toString()}`);
  return { positions: input, income, pendingBalances, assetClasses, rates: rates ?? {}, ratesLoaded: rates !== null };
}
