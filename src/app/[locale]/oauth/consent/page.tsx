import { SESSION_COOKIE } from "@sextante/core/contracts";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { redirect } from "@/i18n/navigation";
import { getSessionUser } from "@/shared/api/session";
import ConsentClient from "@/features/oauth/components/ConsentClient";
import RouteMessages from "@/i18n/RouteMessages";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    client_id?: string;
    scope?: string;
    authorize_params?: string;
  }>;
};

/** Base de la API para llamadas server-side (Next server -> NestJS directo). */
const API_URL = process.env.API_URL ?? "http://localhost:3001";

/**
 * Pantalla de consentimiento OAuth: el servidor MCP redirige aquí cuando un cliente LLM pide
 * acceso a la cartera. Muestra qué aplicación y qué permisos, y al aprobar registra el
 * consentimiento y reanuda el flujo de `/authorize`. Requiere sesión: si no la hay, manda al
 * login conservando el destino (returnTo). Ver `_local/mcp-integracion.md`.
 */
export default async function ConsentPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const t = await getTranslations("oauth.consent");

  const clientId = sp.client_id;
  const scope = sp.scope;
  const authorizeParams = sp.authorize_params;

  if (!clientId || !scope || !authorizeParams) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-24 text-center">
        <p className="text-sm text-warning">{t("missing")}</p>
      </div>
    );
  }

  const user = await getSessionUser();
  if (!user) {
    // Conserva la URL de consentimiento para volver tras iniciar sesión.
    const returnTo = `/oauth/consent?client_id=${encodeURIComponent(
      clientId,
    )}&scope=${encodeURIComponent(scope)}&authorize_params=${encodeURIComponent(authorizeParams)}`;
    redirect({ href: { pathname: "/entrar", query: { returnTo } }, locale });
  }

  // Nombre legible de la aplicación (best-effort; si falla, intro genérica).
  let clientName: string | null = null;
  try {
    const res = await fetch(`${API_URL}/api/oauth/consent/client/${encodeURIComponent(clientId)}`, {
      headers: { cookie: `${SESSION_COOKIE}=${await sessionToken()}` },
      cache: "no-store",
    });
    if (res.ok) {
      const info = (await res.json()) as { clientName: string | null };
      clientName = info.clientName;
    }
  } catch {
    clientName = null;
  }

  const scopes = scope.split(" ").filter(Boolean);

  return (
    <RouteMessages route="oauth/consent">
      <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-16">
        <div className="flex flex-col gap-2 text-center">
          <h1 className="text-2xl font-semibold text-foreground">{t("title")}</h1>
          <p className="text-sm text-muted">{clientName ? t("intro", { app: clientName }) : t("introGeneric")}</p>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
          <ConsentClient clientId={clientId} scopes={scopes} authorizeParams={authorizeParams} />
        </div>
      </div>
    </RouteMessages>
  );
}

/** Lee la cookie de sesión para reenviarla a la API server-side. */
async function sessionToken(): Promise<string> {
  const { cookies } = await import("next/headers");
  return (await cookies()).get(SESSION_COOKIE)?.value ?? "";
}
