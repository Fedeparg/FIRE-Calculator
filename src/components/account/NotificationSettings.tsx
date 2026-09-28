"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";

/** Preferencias tal y como las devuelve `GET /api/account/notifications`. */
type Settings = {
  fireAlertsEnabled: boolean;
  locale: "es" | "en";
  lastFireMilestone: number | null;
  goal: { name: string; updatedAt: string } | null;
};

type LoadState = "loading" | "loaded" | "error";

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
  const [state, setState] = useState<LoadState>("loading");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);

  // El estado arranca en "loading": solo se fija tras el await, igual que `ConnectedApps`.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/account/notifications", { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as Settings;
        if (!cancelled) {
          setSettings(data);
          setState("loaded");
        }
      } catch {
        if (!cancelled) setState("error");
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function toggle(enabled: boolean) {
    setSaving(true);
    setSaveError(false);
    try {
      const res = await fetch("/api/account/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fireAlertsEnabled: enabled, locale }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setSettings((await res.json()) as Settings);
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
