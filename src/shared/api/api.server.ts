import "server-only";
import { SESSION_COOKIE } from "@sextante/core/contracts";
import { cookies } from "next/headers";

const API_URL = process.env.API_URL ?? "http://localhost:3001";

/**
 * Reenvía la cookie de sesión a la API. `null` (sin cookie, error o fallo de red) es
 * ambiguo a propósito: cada llamante decide su valor de reserva. No autoriza nada: lo hace la API.
 */
export async function apiFetch<T>(path: string): Promise<T | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  try {
    const res = await fetch(`${API_URL}${path}`, {
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
