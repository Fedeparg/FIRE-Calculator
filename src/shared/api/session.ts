import "server-only";

import { redirect } from "next/navigation";

import { routing } from "@/i18n/routing";

import { serverApiFetch } from "./api.server";

export type SessionUser = { id: string; email: string };

/** Valida la cookie contra `/api/auth/me`; `null` sin sesión. La autorización la decide el servidor. */
export async function getSessionUser(): Promise<SessionUser | null> {
  return serverApiFetch<SessionUser>("/api/auth/me");
}

/**
 * Protección server-side de una página privada: el usuario de la sesión o, sin sesión válida,
 * redirige al login de su idioma (`redirect` corta el render, así que nunca devuelve `null`).
 */
export async function requireSessionUser(locale: string): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    const prefix = locale === routing.defaultLocale ? "" : `/${locale}`;
    redirect(`${prefix}/entrar`);
  }
  return user;
}
