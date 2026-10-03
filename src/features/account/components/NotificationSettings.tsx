"use client";

import { useId, useState } from "react";
import type { NotificationSettingsResponse } from "@sextante/core/contracts";
import { useLocale, useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { NO_STORE, apiJson } from "@/shared/api/client";
import { useApiMutation } from "@/shared/api/use-api-mutation";
import { useApiQuery } from "@/shared/api/use-api-query";

const NOTIFICATIONS_PATH = "/api/account/notifications";
// Constante de módulo: `useApiQuery` exige opciones estables entre renders.

/**
 * Avisos por email de los hitos del objetivo FIRE (25/50/75/100 %). Opt-in: la casilla arranca
 * desmarcada hasta que el usuario la activa. Al activarlos se guarda el idioma de la interfaz,
 * que es en el que llegarán los correos.
 *
 * Solo refleja lo que diga la API: la preferencia la decide y la guarda el servidor.
 */
export default function NotificationSettings() {
  const t = useTranslations("account.notifications");
  const alertsId = useId();
  const locale = useLocale() === "en" ? "en" : "es";
  const query = useApiQuery<NotificationSettingsResponse>(NOTIFICATIONS_PATH, { init: NO_STORE });
  // Lo guardado (respuesta del PATCH) manda sobre la carga inicial.
  const [saved, setSaved] = useState<NotificationSettingsResponse | null>(null);
  const save = useApiMutation();

  const settings = saved ?? (query.status === "ready" ? query.data : null);
  const state = settings ? "loaded" : query.status;

  async function toggle(enabled: boolean) {
    const result = await save.run(() =>
      apiJson<NotificationSettingsResponse>(NOTIFICATIONS_PATH, {
        method: "PATCH",
        body: { fireAlertsEnabled: enabled, locale },
      }),
    );
    if (result.ok) setSaved(result.data);
  }

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-6">
      <h2 className="text-lg font-semibold text-foreground">{t("title")}</h2>
      <p className="text-sm text-muted">{t("intro")}</p>

      {state === "loading" && <p className="text-sm text-muted">{t("loading")}</p>}
      {state === "error" && <p className="text-sm text-warning">{t("loadError")}</p>}

      {state === "loaded" && settings && (
        <>
          <div className="flex items-start gap-2">
            <input
              id={alertsId}
              type="checkbox"
              checked={settings.fireAlertsEnabled}
              disabled={save.status === "pending"}
              onChange={(e) => void toggle(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-brand"
            />
            <label htmlFor={alertsId} className="text-sm text-foreground">
              {t("fireAlerts")}
            </label>
          </div>

          {settings.goal ? (
            <p className="text-xs text-muted">{t("goal", { name: settings.goal.name })}</p>
          ) : (
            <p className="text-xs text-warning">
              {t("noGoal")}{" "}
              <Link href="/portfolio" className="font-medium text-brand underline underline-offset-2">
                {t("noGoalLink")}
              </Link>
            </p>
          )}

          {settings.fireAlertsEnabled && (
            <p className="text-xs text-muted">{t("language", { language: t(`languages.${settings.locale}`) })}</p>
          )}
          {save.status === "error" && <p className="text-sm text-warning">{t("saveError")}</p>}
          <p className="text-xs text-muted">{t("disclaimer")}</p>
        </>
      )}
    </section>
  );
}
