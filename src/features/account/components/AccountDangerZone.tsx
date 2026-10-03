"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { Link, useRouter } from "@/i18n/navigation";
import Button from "@/shared/ui/Button";
import Notice from "@/shared/ui/Notice";
import { downloadBlob } from "@/shared/format/download";
import { apiFetch, createApiErrorMapper } from "@/shared/api/client";
import { useApiErrorText } from "@/shared/api/use-api-error-text";
import { useApiMutation } from "@/shared/api/use-api-mutation";

/**
 * Maps the failure (network, session, server) to a message in the `account` namespace, without
 * dumping the raw API body. That namespace has no `errorInvalid`: there is no form to check here.
 */
const errorKeyFor = createApiErrorMapper({ invalidFallback: "errorGeneric" });

type Props = {
  /** Email of the authenticated user (from the server). Used to confirm the deletion. */
  email: string;
};

/**
 * Account section with the two GDPR (RGPD) rights: export my data (downloads a JSON) and
 * delete my account. Deletion requires typing one's own email to confirm; authorization and
 * per-user scoping are ALWAYS decided by the API (userId from the JWT).
 */
export default function AccountDangerZone({ email }: Props) {
  const t = useTranslations("account");
  const errorText = useApiErrorText(t);
  const confirmId = useId();
  const router = useRouter();

  // Export.
  const exportData = useApiMutation();
  const exporting = exportData.status === "pending";

  // Deletion.
  const [confirmEmail, setConfirmEmail] = useState("");
  const deletion = useApiMutation();
  const deleteError = deletion.error === null ? null : errorKeyFor(deletion.error);

  // Clear the redirect timer if the component unmounts first.
  const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (redirectTimer.current) clearTimeout(redirectTimer.current);
    };
  }, []);

  // The confirmed email must match the user's (the API lowercases it at sign-in, so we
  // compare in lowercase).
  const emailMatches = confirmEmail.trim().toLowerCase() === email.toLowerCase();

  /** Downloads the data JSON via a blob so errors (401, network…) can be handled. */
  async function handleExport() {
    await exportData.run(async () => {
      const res = await apiFetch("/api/auth/account/export");
      downloadBlob(await res.blob(), "sextante-datos.json");
    });
  }

  /** Deletes the account once the email is confirmed; when done, redirects to the home page. */
  async function handleDelete() {
    if (!emailMatches || deletion.status === "pending" || deletion.status === "success") return;
    const result = await deletion.run(() => apiFetch("/api/auth/account", { method: "DELETE" }));
    if (!result.ok) return;
    // Short pause so the user sees the notice before leaving.
    redirectTimer.current = setTimeout(() => {
      router.replace("/");
      router.refresh();
    }, 1500);
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Export my data */}
      <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-6">
        <h2 className="text-lg font-semibold text-foreground">{t("export.title")}</h2>
        <p className="text-sm text-muted">{t("export.description")}</p>
        <Button variant="secondary" size="lg" onClick={handleExport} disabled={exporting} className="self-start">
          {exporting ? t("export.exporting") : t("export.button")}
        </Button>
        {exportData.status === "error" && <p className="text-sm text-warning">{t("export.error")}</p>}
      </section>

      {/* Danger zone: delete my account */}
      <section className="flex flex-col gap-3 rounded-2xl border border-danger-border bg-danger-soft p-6">
        <h2 className="text-lg font-semibold text-danger">{t("danger.title")}</h2>
        <h3 className="text-base font-medium text-foreground">{t("delete.title")}</h3>
        <p className="text-sm text-muted">{t("delete.description")}</p>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={confirmId} className="text-sm font-medium text-foreground">
            {t("delete.confirmLabel", { email })}
          </label>
          <input
            id={confirmId}
            type="email"
            autoComplete="off"
            value={confirmEmail}
            onChange={(e) => setConfirmEmail(e.target.value)}
            placeholder={t("delete.placeholder")}
            disabled={deletion.status === "success"}
            className="w-full max-w-sm rounded-lg border border-border bg-background px-3 py-2 text-foreground outline-hidden focus:border-danger focus:ring-2 focus:ring-danger/30"
          />
        </div>

        <Button
          variant="danger"
          size="lg"
          onClick={handleDelete}
          disabled={!emailMatches || deletion.status === "pending" || deletion.status === "success"}
          className="self-start"
        >
          {deletion.status === "pending" ? t("delete.deleting") : t("delete.button")}
        </Button>

        {deletion.status === "success" && <Notice variant="info">{t("delete.success")}</Notice>}

        {deleteError && (
          <p className="text-sm text-warning">
            {errorText(deleteError)}
            {deleteError === "errorSession" && (
              <>
                {" "}
                <Link href="/entrar" className="font-medium text-brand underline underline-offset-2">
                  {t("errorSessionLink")}
                </Link>
              </>
            )}
          </p>
        )}
      </section>
    </div>
  );
}
