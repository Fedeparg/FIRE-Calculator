import "server-only";

import { serverApiFetch } from "./api.server";

export type SessionUser = { id: string; email: string };

/** Valida la cookie contra `/api/auth/me`; `null` sin sesión. La autorización la decide el servidor. */
export async function getSessionUser(): Promise<SessionUser | null> {
  return serverApiFetch<SessionUser>("/api/auth/me");
}
