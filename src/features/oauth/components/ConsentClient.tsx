"use client";

import { useTranslations } from "next-intl";

import { denyRedirectTarget } from "@/features/oauth/model/deny-redirect";
import { apiFetch } from "@/shared/api/client";
import { useApiMutation } from "@/shared/api/use-api-mutation";
import Button from "@/shared/ui/Button";

type Props = {
  clientId: string;
  scopes: string[];
  /** Original `/authorize` query, used to resume the flow after approval. */
  authorizeParams: string;
  /** `redirect_uris` registered by the client (empty if the API did not respond). */
  redirectUris: readonly string[];
};

const SCOPE_LABELS: Record<string, string> = {
  "portfolio:read": "scopeRead",
  "portfolio:write": "scopeWrite",
};

/**
 * Consent screen actions. On allow, it records the consent in the API and resumes the
 * `/authorize` flow (which will issue the code). On deny, it hands control back to the client
 * with `error=access_denied` if its `redirect_uri` is registered. See `_local/mcp-integracion.md`.
 */
export default function ConsentClient({ clientId, scopes, authorizeParams, redirectUris }: Props) {
  const t = useTranslations("oauth.consent");
  const consent = useApiMutation();
  // `success` counts as busy: the button stays disabled until the navigation completes.
  const working = consent.status === "pending" || consent.status === "success";

  async function allow() {
    const result = await consent.run(() =>
      apiFetch("/api/oauth/consent", { method: "POST", body: { clientId, scopes } }),
    );
    // Resume on OUR origin (not an open redirect): the AS will issue the code.
    if (result.ok) window.location.assign(`/authorize?${authorizeParams}`);
  }

  function deny() {
    // Hand control back to the client with error=access_denied (the correct OAuth flow), but
    // only to a registered redirect_uri: the query is untrusted (see `denyRedirectTarget`).
    window.location.assign(denyRedirectTarget(authorizeParams, clientId, redirectUris));
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-foreground">{t("permissionsTitle")}</p>
        <ul className="flex flex-col gap-2">
          {scopes.map((scope) => (
            <li
              key={scope}
              className="flex items-start gap-2 rounded-lg bg-accent-soft px-3 py-2 text-sm text-foreground"
            >
              <span aria-hidden className="mt-0.5 text-brand">
                ✓
              </span>
              <span>{SCOPE_LABELS[scope] ? t(SCOPE_LABELS[scope]) : scope}</span>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-xs text-muted">{t("warning")}</p>

      {consent.status === "error" && <p className="text-sm text-warning">{t("error")}</p>}

      <div className="flex flex-col gap-2 sm:flex-row-reverse">
        <Button size="lg" onClick={allow} disabled={working} className="w-full">
          {working ? t("working") : t("allow")}
        </Button>
        <Button variant="secondary" size="lg" onClick={deny} disabled={working} className="w-full">
          {t("deny")}
        </Button>
      </div>
    </div>
  );
}
