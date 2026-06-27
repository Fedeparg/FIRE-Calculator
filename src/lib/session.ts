import "server-only";
import { cookies } from "next/headers";

/** Debe coincidir con SESSION_COOKIE de la API (apps/api). */
const SESSION_COOKIE = "sextante_session";

/** Base de la API para llamadas server-side (Next server -> NestJS directo). */
const API_URL = process.env.API_URL ?? "http://localhost:3001";

export type SessionUser = { id: string; email: string };

/**
 * Devuelve el usuario autenticado leyendo la cookie de sesión y validándola contra
 * la API (`/api/auth/me`), o `null` si no hay sesión válida. La autorización la
 * decide SIEMPRE el servidor; nunca confiamos en el cliente.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  try {
    const res = await fetch(`${API_URL}/api/auth/me`, {
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as SessionUser;
  } catch {
    return null;
  }
}
