"use client";

import { useState } from "react";
import type { ConnectedApp } from "@sextante/core/contracts";
import { useTranslations } from "next-intl";

import { formatIsoDate } from "@/shared/format/format";
import { absoluteUrl } from "@/shared/seo/site";
import { NO_STORE, apiFetch } from "@/shared/api/client";
import { useApiMutation } from "@/shared/api/use-api-mutation";
import { useApiQuery } from "@/shared/api/use-api-query";
import Button from "@/shared/ui/Button";

const CONNECTIONS_PATH = "/api/account/connections";
// Module-level constant: `useApiQuery` requires options that are stable across renders.

const SCOPE_LABELS: Record<string, string> = {
  "portfolio:read": "scopeRead",
  "portfolio:write": "scopeWrite",
};

/**
 * Public URL of the MCP server: the site's canonical origin + the MCP endpoint.
 * It comes from `NEXT_PUBLIC_SITE_URL` (via `src/shared/seo/site.ts`), not from a hand-written
 * constant, so a deployment on another domain shows ITS URL.
 */
const MCP_URL = absoluteUrl("/api/mcp");

/**
 * Lists the OAuth/MCP apps connected to the user's portfolio and lets them be revoked (a GDPR
 * right + good UX). Authorization and per-user scoping are ALWAYS decided by the API (userId
 * from the JWT); here we only display and request revocation. See `_local/mcp-integracion.md`.
 */
export default function ConnectedApps() {
  const t = useTranslations("account.connections");
  const query = useApiQuery<ConnectedApp[]>(CONNECTIONS_PATH, { init: NO_STORE });
  // Revoked ones are hidden without refetching the list.
  const [revoked, setRevoked] = useState<ReadonlySet<string>>(new Set());
  const state = query.status === "ready" ? "loaded" : query.status;
  const items = query.status === "ready" ? query.data.filter((c) => !revoked.has(c.clientId)) : [];
  const revocation = useApiMutation();
  // Which connection is being revoked, so only its button is disabled and relabelled.
  const [revoking, setRevoking] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(MCP_URL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* no clipboard: the user can select and copy by hand */
    }
  }

  async function revoke(clientId: string) {
    setRevoking(clientId);
    const result = await revocation.run(() =>
      apiFetch(`/api/account/connections/${encodeURIComponent(clientId)}`, { method: "DELETE" }),
    );
    if (result.ok) setRevoked((prev) => new Set(prev).add(clientId));
    setRevoking(null);
  }

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-6">
      <h2 className="text-lg font-semibold text-foreground">{t("title")}</h2>
      <p className="text-sm text-muted">{t("description")}</p>

      {state === "loading" && <p className="text-sm text-muted">{t("loading")}</p>}
      {state === "error" && <p className="text-sm text-warning">{t("error")}</p>}
      {state === "loaded" && items.length === 0 && <p className="text-sm text-muted">{t("empty")}</p>}

      {state === "loaded" && items.length > 0 && (
        <ul className="flex flex-col gap-3">
          {items.map((c) => (
            <li
              key={c.clientId}
              className="flex flex-col gap-3 rounded-xl border border-border bg-background p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex flex-col gap-2">
                <span className="font-medium text-foreground">{c.clientName ?? t("unnamed")}</span>
                <div className="flex flex-wrap gap-1.5">
                  {c.scopes.map((scope) => (
                    <span key={scope} className="rounded-md bg-accent-soft px-2 py-0.5 text-xs text-foreground">
                      {SCOPE_LABELS[scope] ? t(SCOPE_LABELS[scope]) : scope}
                    </span>
                  ))}
                </div>
                <span className="text-xs text-muted">
                  {t("connected", { date: formatIsoDate(c.createdAt.slice(0, 10)) })}
                  {" · "}
                  {c.lastUsedAt ? t("lastUsed", { date: formatIsoDate(c.lastUsedAt.slice(0, 10)) }) : t("neverUsed")}
                </span>
              </div>
              <Button
                variant="dangerOutline"
                onClick={() => revoke(c.clientId)}
                disabled={revoking === c.clientId}
                className="self-start"
              >
                {revoking === c.clientId ? t("revoking") : t("revoke")}
              </Button>
            </li>
          ))}
        </ul>
      )}

      {revocation.status === "error" && <p className="text-sm text-warning">{t("revokeError")}</p>}

      {/* How to connect an AI assistant to Sextante's MCP server. */}
      <details className="mt-1 rounded-xl border border-border bg-background p-4">
        <summary className="cursor-pointer text-sm font-medium text-foreground">{t("howToTitle")}</summary>
        <div className="mt-3 flex flex-col gap-3">
          <p className="text-sm text-muted">{t("howToIntro")}</p>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted">{t("urlLabel")}</span>
            <div className="flex flex-wrap items-center gap-2">
              <code className="select-all rounded-md bg-surface-2 px-2.5 py-1.5 text-sm text-foreground">
                {MCP_URL}
              </code>
              <button
                type="button"
                onClick={copyUrl}
                className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted transition hover:bg-surface-2 hover:text-foreground"
              >
                {copied ? t("copied") : t("copy")}
              </button>
            </div>
          </div>
          <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm text-muted">
            <li>{t("step1")}</li>
            <li>{t("step2")}</li>
            <li>{t("step3")}</li>
          </ol>
          <p className="text-xs text-muted">{t("howToNote")}</p>
        </div>
      </details>
    </section>
  );
}
