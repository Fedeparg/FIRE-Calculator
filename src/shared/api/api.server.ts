import "server-only";
import { SESSION_COOKIE } from "@sextante/core/contracts";
import { cookies } from "next/headers";

import { serverApiUrl } from "@/shared/config/env.server";

/**
 * GET to the API from the Next server, forwarding the session cookie. `null` (no cookie, error
 * or network failure) is ambiguous on purpose: each caller picks its own fallback. It authorizes
 * nothing: the API does. It is named differently from the client's `apiFetch`
 * (`shared/api/client.ts`) so nobody imports one thinking it is the other.
 */
export async function serverApiFetch<T>(path: string): Promise<T | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  // Outside the `try`: a broken configuration must fail visibly, not pass as "no data".
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
