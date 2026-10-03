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
 * OAuth consent screen: the MCP server redirects here when an LLM client requests access to
 * the portfolio. It shows which application and which scopes; on approval it records the
 * consent and resumes the `/authorize` flow. Requires a session: without one it sends the user
 * to login, preserving the destination (returnTo). See `_local/mcp-integracion.md`.
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
    // Keep the consent URL so the user comes back here after signing in.
    const returnTo = `/oauth/consent?client_id=${encodeURIComponent(
      clientId,
    )}&scope=${encodeURIComponent(scope)}&authorize_params=${encodeURIComponent(authorizeParams)}`;
    redirect({ href: { pathname: "/entrar", query: { returnTo } }, locale });
  }

  // Human-readable application name (best effort; on failure, a generic intro) and its
  // registered `redirect_uris` (without them, "Deny" goes back to the home page).
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
