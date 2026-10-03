"use client";

import { useTranslations } from "next-intl";

import { useRouter } from "@/i18n/navigation";
import { apiFetch } from "@/shared/api/client";
import { useApiMutation } from "@/shared/api/use-api-mutation";
import Button from "@/shared/ui/Button";

/**
 * "Cerrar todas las sesiones" (Sign out everywhere): invalidates all of the user's sessions on
 * the server (this browser included), in case they signed in on someone else's device or suspect
 * someone kept their session. Afterwards it returns to the login page.
 */
export default function AccountSessions() {
  const t = useTranslations("account.sessions");
  const router = useRouter();
  const revoke = useApiMutation();
  const working = revoke.status === "pending" || revoke.status === "success";

  async function handleRevoke() {
    const result = await revoke.run(() => apiFetch("/api/auth/sessions/revoke", { method: "POST" }));
    if (!result.ok) return;
    // `refresh` so the layout (user menu) stops seeing the now-closed session.
    router.replace("/entrar");
    router.refresh();
  }

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-6">
      <h2 className="text-lg font-semibold text-foreground">{t("title")}</h2>
      <p className="text-sm text-muted">{t("description")}</p>
      <Button variant="secondary" size="lg" onClick={handleRevoke} disabled={working} className="self-start">
        {working ? t("revoking") : t("button")}
      </Button>
      {revoke.status === "error" && <p className="text-sm text-warning">{t("error")}</p>}
    </section>
  );
}
