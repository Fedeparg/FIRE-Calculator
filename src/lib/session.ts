import "server-only";

import { apiFetch } from "./api.server";

export type SessionUser = { id: string; email: string };

/**
 * Devuelve el usuario autenticado validando la cookie de sesión contra la API
 * (`/api/auth/me`), o `null` si no hay sesión válida. La autorización la decide
 * SIEMPRE el servidor; nunca confiamos en el cliente.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  return apiFetch<SessionUser>("/api/auth/me");
}
