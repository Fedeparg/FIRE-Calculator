"use client";

import { useTranslations } from "next-intl";

import { useRouter } from "@/i18n/navigation";
import { apiFetch } from "@/shared/api/client";
import { useApiMutation } from "@/shared/api/use-api-mutation";
import Button from "@/shared/ui/Button";

/**
 * "Cerrar todas las sesiones": invalida en el servidor todos los inicios de sesión del usuario
 * (este navegador incluido), por si ha entrado en un equipo ajeno o sospecha que alguien se ha
 * quedado con su sesión. Tras hacerlo, vuelve al login.
 */
export default function AccountSessions() {
  const t = useTranslations("account.sessions");
  const router = useRouter();
  const revoke = useApiMutation();
  const working = revoke.status === "pending" || revoke.status === "success";

  async function handleRevoke() {
    const result = await revoke.run(() => apiFetch("/api/auth/sessions/revoke", { method: "POST" }));
    if (!result.ok) return;
    // `refresh` para que el layout (menú de usuario) deje de ver la sesión ya cerrada.
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
