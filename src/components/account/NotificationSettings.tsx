"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { apiJson } from "@/shared/api/client";
import { useApiQuery } from "@/shared/api/use-api-query";

/** Preferencias tal y como las devuelve `GET /api/account/notifications`. */
type Settings = {
  fireAlertsEnabled: boolean;
  locale: "es" | "en";
  lastFireMilestone: number | null;
  goal: { name: string; updatedAt: string } | null;
};

const NOTIFICATIONS_PATH = "/api/account/notifications";
// Constante de módulo: `useApiQuery` exige opciones estables entre renders.
const NO_STORE = { cache: "no-store" } as const;

/**
 * Avisos por email de los hitos del objetivo FIRE (25/50/75/100 %). Opt-in: la casilla arranca
 * desmarcada hasta que el usuario la activa. Al activarlos se guarda el idioma de la interfaz,
 * que es en el que llegarán los correos.
 *
 * Solo refleja lo que diga la API: la preferencia la decide y la guarda el servidor.
 */
export default function NotificationSettings() {
  const t = useTranslations("account.notifications");
  const locale = useLocale() === "en" ? "en" : "es";
  const query = useApiQuery<Settings>(NOTIFICATIONS_PATH, { init: NO_STORE });
  // Lo guardado (respuesta del PATCH) manda sobre la carga inicial.
  const [saved, setSaved] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);

  const settings = saved ?? (query.status === "ready" ? query.data : null);
  const state = settings ? "loaded" : query.status;

  async function toggle(enabled: boolean) {
    setSaving(true);
    setSaveError(false);
    try {
      setSaved(
        await apiJson<Settings>(NOTIFICATIONS_PATH, { method: "PATCH", body: { fireAlertsEnabled: enabled, locale } }),
      );
    } catch {
      setSaveError(true);
    } finally {
      setSaving(false);
    }
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
              id="fire-alerts"
              type="checkbox"
              checked={settings.fireAlertsEnabled}
              disabled={saving}
              onChange={(e) => void toggle(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-brand"
            />
            <label htmlFor="fire-alerts" className="text-sm text-foreground">
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
          {saveError && <p className="text-sm text-warning">{t("saveError")}</p>}
          <p className="text-xs text-muted">{t("disclaimer")}</p>
        </>
      )}
    </section>
  );
}
