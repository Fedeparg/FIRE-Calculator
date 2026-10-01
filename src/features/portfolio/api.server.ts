import "server-only";

import { apiFetch } from "@/shared/api/api.server";
import type { Position, PositionLot } from "@sextante/core/portfolio/types";

/** Posiciones para el SSR inicial; `[]` ante cualquier fallo (la página ya está protegida). */
export async function fetchPositions(): Promise<Position[]> {
  return (await apiFetch<Position[]>("/api/positions")) ?? [];
}

/**
 * Posiciones y todas sus operaciones para el informe de plusvalías; `null` si falla una
 * lectura. No se disfraza de lista vacía: "no tienes ventas" por un error sería un falso fiscal.
 */
export async function fetchPositionsWithLots(): Promise<{
  positions: Position[];
  lots: PositionLot[];
} | null> {
  const [positions, lots] = await Promise.all([
    apiFetch<Position[]>("/api/positions"),
    apiFetch<PositionLot[]>("/api/positions/lots"),
  ]);
  return positions && lots ? { positions, lots } : null;
}
