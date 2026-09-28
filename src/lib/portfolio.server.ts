import "server-only";

import { apiFetch } from "./api.server";
import type { Position, PositionLot } from "./portfolio";

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
 * Carga TODAS las operaciones del usuario autenticado (todas sus posiciones) para el render
 * inicial. Devuelve `[]` ante cualquier fallo, igual que `fetchPositions`.
 */
export async function fetchAllLots(): Promise<PositionLot[]> {
  return (await apiFetch<PositionLot[]>("/api/positions/lots")) ?? [];
}
