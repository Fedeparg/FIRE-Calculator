import "server-only";

import { redirect } from "next/navigation";

import { routing } from "@/i18n/routing";

import { serverApiFetch } from "./api.server";

export type SessionUser = { id: string; email: string };

/** Validates the cookie against `/api/auth/me`; `null` without a session. The server decides authorization. */
export async function getSessionUser(): Promise<SessionUser | null> {
  return serverApiFetch<SessionUser>("/api/auth/me");
}

/**
 * Server-side guard for a private page: returns the session user or, without a valid session,
 * redirects to the login page in its locale (`redirect` aborts the render, so it never returns
 * `null`).
 */
export async function requireSessionUser(locale: string): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    const prefix = locale === routing.defaultLocale ? "" : `/${locale}`;
    redirect(`${prefix}/entrar`);
  }
  return user;
}
