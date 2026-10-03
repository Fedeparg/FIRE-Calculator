import "server-only";

import { serverApiFetch } from "@/shared/api/api.server";
import type { ReferenceRates } from "@sextante/core/fiscal/fx-reference";
import type { IncomeEvent } from "@sextante/core/fiscal/income";
import type { RealisedGainsPosition } from "@sextante/core/fiscal/realised-gains";
import { referenceRatesRequest, toRealisedGainsPositions } from "@sextante/core/fiscal/report-inputs";
import type { PendingNegative } from "@sextante/core/fiscal/savings-base";
import type { AssetClass, Position, PositionLot } from "@sextante/core/portfolio/types";

/** Posiciones para el SSR inicial; `[]` ante cualquier fallo (la página ya está protegida). */
export async function fetchPositions(): Promise<Position[]> {
  return (await serverApiFetch<Position[]>("/api/positions")) ?? [];
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
    serverApiFetch<Position[]>("/api/positions"),
    serverApiFetch<PositionLot[]>("/api/positions/lots"),
    serverApiFetch<IncomeEvent[]>("/api/income"),
    serverApiFetch<PendingNegative[]>("/api/tax-return/pending-balances"),
  ]);
  if (!positions || !lots || !income || !pendingBalances) return null;

  const input = toRealisedGainsPositions(positions, lots);
  const assetClasses = Object.fromEntries(positions.map((p) => [p.id, p.assetClass]));
  const needed = referenceRatesRequest(input, income);
  if (!needed) return { positions: input, income, pendingBalances, assetClasses, rates: {}, ratesLoaded: true };

  const query = new URLSearchParams({ currencies: needed.currencies.join(","), from: needed.from });
  const rates = await serverApiFetch<ReferenceRates>(`/api/fx/reference-rates?${query.toString()}`);
  return { positions: input, income, pendingBalances, assetClasses, rates: rates ?? {}, ratesLoaded: rates !== null };
}
