import "server-only";
import { cookies } from "next/headers";

import type { Position } from "./portfolio";

/** Debe coincidir con SESSION_COOKIE de la API (apps/api). */
const SESSION_COOKIE = "sextante_session";
const API_URL = process.env.API_URL ?? "http://localhost:3001";

/**
 * Carga las posiciones del usuario autenticado para el render inicial (SSR). Reenvía
 * la cookie de sesión a la API, que decide la autorización y el scoping por usuario.
 * Devuelve `[]` ante cualquier fallo (la página ya está protegida server-side).
 */
export async function fetchPositions(): Promise<Position[]> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return [];

  try {
    const res = await fetch(`${API_URL}/api/positions`, {
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
      cache: "no-store",
    });
    if (!res.ok) return [];
    return (await res.json()) as Position[];
  } catch {
    return [];
  }
}
