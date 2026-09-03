import "server-only";
import { cookies } from "next/headers";

/** Debe coincidir con SESSION_COOKIE de la API (apps/api). */
const SESSION_COOKIE = "sextante_session";

/** Base de la API para llamadas server-side (Next server -> NestJS directo). */
const API_URL = process.env.API_URL ?? "http://localhost:3001";

/**
 * Petición server-side a la API reenviando la cookie de sesión del navegante.
 *
 * Devuelve el cuerpo ya parseado, o `null` si no hay cookie, si la API responde
 * con un estado de error o si la petición falla. El `null` es deliberadamente
 * ambiguo: cada llamante decide qué significa en su caso (usuario anónimo,
 * lista vacía…), porque el valor de reserva correcto depende de la pantalla.
 *
 * No toma NINGUNA decisión de autorización: se limita a reenviar la cookie
 * intacta. Quien autoriza y hace el scoping por usuario es siempre la API.
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
