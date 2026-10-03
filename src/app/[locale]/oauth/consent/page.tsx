import { getTranslations, setRequestLocale } from "next-intl/server";

import { redirect } from "@/i18n/navigation";
import { serverApiFetch } from "@/shared/api/api.server";
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

  // Nombre legible de la aplicación (best-effort; si falla, intro genérica) y sus
  // `redirect_uris` registradas (sin ellas, "Denegar" vuelve a la portada).
  const client = await serverApiFetch<{ clientName: string | null; redirectUris?: string[] }>(
    `/api/oauth/consent/client/${encodeURIComponent(clientId)}`,
  );
  const clientName = client?.clientName ?? null;
  const redirectUris = client?.redirectUris ?? [];

  const scopes = scope.split(" ").filter(Boolean);

  return (
    <RouteMessages route="oauth/consent">
      <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-16">
        <div className="flex flex-col gap-2 text-center">
          <h1 className="text-2xl font-semibold text-foreground">{t("title")}</h1>
          <p className="text-sm text-muted">{clientName ? t("intro", { app: clientName }) : t("introGeneric")}</p>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
          <ConsentClient
            clientId={clientId}
            scopes={scopes}
            authorizeParams={authorizeParams}
            redirectUris={redirectUris}
          />
        </div>
      </div>
    </RouteMessages>
  );
}
