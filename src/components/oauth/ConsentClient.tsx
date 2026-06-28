"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

type Props = {
  clientId: string;
  scopes: string[];
  /** Query original de `/authorize` para reanudar el flujo tras aprobar. */
  authorizeParams: string;
};

const SCOPE_LABELS: Record<string, string> = {
  "portfolio:read": "scopeRead",
  "portfolio:write": "scopeWrite",
};

/**
 * Acciones de la pantalla de consentimiento. Al permitir, registra el consentimiento en la
 * API y reanuda el flujo de `/authorize` (que emitirá el código). Al denegar, devuelve el
 * control al cliente con `error=access_denied`. Ver `_local/mcp-integracion.md`.
 */
export default function ConsentClient({ clientId, scopes, authorizeParams }: Props) {
  const t = useTranslations("oauth.consent");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState(false);

  async function allow() {
    setWorking(true);
    setError(false);
    try {
      const res = await fetch("/api/oauth/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, scopes }),
      });
      if (!res.ok) {
        setError(true);
        setWorking(false);
        return;
      }
      // Reanuda en NUESTRO origen (no es redirect abierto): el AS emitirá el código.
      window.location.assign(`/authorize?${authorizeParams}`);
    } catch {
      setError(true);
      setWorking(false);
    }
  }

  function deny() {
    // Devuelve el control al cliente con error=access_denied (flujo OAuth correcto).
    const params = new URLSearchParams(authorizeParams);
    const redirectUri = params.get("redirect_uri");
    const state = params.get("state");
    if (redirectUri) {
      try {
        const target = new URL(redirectUri);
        target.searchParams.set("error", "access_denied");
        if (state) target.searchParams.set("state", state);
        window.location.assign(target.href);
        return;
      } catch {
        /* cae al fallback */
      }
    }
    window.location.assign("/");
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

      {error && <p className="text-sm text-warning">{t("error")}</p>}

      <div className="flex flex-col gap-2 sm:flex-row-reverse">
        <button
          type="button"
          onClick={allow}
          disabled={working}
          className="w-full rounded-lg bg-brand px-4 py-2.5 font-medium text-brand-fg transition hover:opacity-90 disabled:opacity-50"
        >
          {working ? t("working") : t("allow")}
        </button>
        <button
          type="button"
          onClick={deny}
          disabled={working}
          className="w-full rounded-lg border border-border bg-background px-4 py-2.5 font-medium text-foreground transition hover:bg-surface disabled:opacity-50"
        >
          {t("deny")}
        </button>
      </div>
    </div>
  );
}
