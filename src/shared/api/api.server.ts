import "server-only";
import { SESSION_COOKIE } from "@sextante/core/contracts";
import { cookies } from "next/headers";

import { serverApiUrl } from "@/shared/config/env.server";

/**
 * GET a la API desde el servidor de Next, reenviando la cookie de sesión. `null` (sin cookie,
 * error o fallo de red) es ambiguo a propósito: cada llamante decide su valor de reserva. No
 * autoriza nada: lo hace la API. Se llama distinto que el `apiFetch` del cliente
 * (`shared/api/client.ts`) para que nadie importe uno creyendo que es el otro.
 */
export async function serverApiFetch<T>(path: string): Promise<T | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  // Fuera del `try`: una configuración rota debe fallar a la vista, no pasar por "sin datos".
  const url = `${serverApiUrl()}${path}`;
  try {
    const res = await fetch(url, {
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
