"use client";

import { useTranslations } from "next-intl";

import { denyRedirectTarget } from "@/features/oauth/model/deny-redirect";
import { apiFetch } from "@/shared/api/client";
import { useApiMutation } from "@/shared/api/use-api-mutation";
import Button from "@/shared/ui/Button";

type Props = {
  clientId: string;
  scopes: string[];
  /** Query original de `/authorize` para reanudar el flujo tras aprobar. */
  authorizeParams: string;
  /** `redirect_uris` registradas por el cliente (vacía si la API no respondió). */
  redirectUris: readonly string[];
};

const SCOPE_LABELS: Record<string, string> = {
  "portfolio:read": "scopeRead",
  "portfolio:write": "scopeWrite",
};

/**
 * Acciones de la pantalla de consentimiento. Al permitir, registra el consentimiento en la
 * API y reanuda el flujo de `/authorize` (que emitirá el código). Al denegar, devuelve el
 * control al cliente con `error=access_denied` si su `redirect_uri` está registrada. Ver `_local/mcp-integracion.md`.
 */
export default function ConsentClient({ clientId, scopes, authorizeParams, redirectUris }: Props) {
  const t = useTranslations("oauth.consent");
  const consent = useApiMutation();
  // `success` cuenta como trabajando: el botón sigue deshabilitado hasta que la navegación termine.
  const working = consent.status === "pending" || consent.status === "success";

  async function allow() {
    const result = await consent.run(() =>
      apiFetch("/api/oauth/consent", { method: "POST", body: { clientId, scopes } }),
    );
    // Reanuda en NUESTRO origen (no es redirect abierto): el AS emitirá el código.
    if (result.ok) window.location.assign(`/authorize?${authorizeParams}`);
  }

  function deny() {
    // Devuelve el control al cliente con error=access_denied (flujo OAuth correcto), pero solo
    // a una redirect_uri registrada: la query no es de fiar (ver `denyRedirectTarget`).
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
