import "server-only";

import { apiFetch } from "@/lib/api.server";
import type { Position, PositionLot } from "@/lib/portfolio";

/**
 * Carga las posiciones del usuario autenticado para el render inicial (SSR). La
 * API decide la autorización y el scoping por usuario a partir de la cookie que
 * se le reenvía. Devuelve `[]` ante cualquier fallo (la página ya está
 * protegida server-side).
 */
export async function fetchPositions(): Promise<Position[]> {
  return (await apiFetch<Position[]>("/api/positions")) ?? [];
}

/**
 * Carga las posiciones y TODAS sus operaciones para el informe de plusvalías, o `null` si
 * cualquiera de las dos lecturas falla. A diferencia de `fetchPositions`, aquí un fallo NO se
 * disfraza de lista vacía: en un informe fiscal, "no tienes ventas" por un error transitorio
 * sería un resultado falso, así que la página enseña el error.
 */
export async function fetchPositionsWithLots(): Promise<{
  positions: Position[];
  lots: PositionLot[];
} | null> {
  // Las dos lecturas son independientes: en paralelo.
  const [positions, lots] = await Promise.all([
    apiFetch<Position[]>("/api/positions"),
    apiFetch<PositionLot[]>("/api/positions/lots"),
  ]);
  return positions && lots ? { positions, lots } : null;
}
