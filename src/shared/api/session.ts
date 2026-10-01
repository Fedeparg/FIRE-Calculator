import "server-only";

import { apiFetch } from "./api.server";

export type SessionUser = { id: string; email: string };

/** Valida la cookie contra `/api/auth/me`; `null` sin sesión. La autorización la decide el servidor. */
export async function getSessionUser(): Promise<SessionUser | null> {
  return apiFetch<SessionUser>("/api/auth/me");
}
