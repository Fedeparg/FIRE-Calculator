"use client";

import { useEffect, useId, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { trackEvent } from "@/shared/analytics/track";
import { apiFetch } from "@/shared/api/client";
import { useApiMutation } from "@/shared/api/use-api-mutation";
import { safeReturnTo } from "@/shared/navigation/safe-return-to";
import Button from "@/shared/ui/Button";

/** Formulario de login por magic link: pide el email y solicita el enlace. */
export default function LoginForm() {
  const t = useTranslations("auth.login");
  const emailId = useId();
  // El email y la página del enlace salen en el idioma de esta página.
  const locale = useLocale();
  const [email, setEmail] = useState("");
  const request = useApiMutation();

  // Si se llega aquí desde un flujo OAuth (?returnTo=/authorize…), recuérdalo para
  // volver tras canjear el magic link. Solo rutas de nuestro origen (anti open-redirect).
  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get("returnTo");
    const returnTo = raw ? safeReturnTo(raw, window.location.origin) : null;
    if (returnTo) window.localStorage.setItem("sextante_return_to", returnTo);
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const result = await request.run(() => apiFetch("/api/auth/request", { method: "POST", body: { email, locale } }));
    if (result.ok) trackEvent({ name: "login-link-requested" });
  }

  if (request.status === "success") {
    return <p className="rounded-lg bg-accent-soft px-4 py-3 text-sm text-foreground">{t("sent")}</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={emailId} className="text-sm font-medium text-foreground">
          {t("emailLabel")}
        </label>
        <input
          id={emailId}
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t("emailPlaceholder")}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground outline-hidden focus:border-brand focus:ring-2 focus:ring-brand/30"
        />
      </div>

      {request.status === "error" && <p className="text-sm text-warning">{t("error")}</p>}

      <Button size="lg" type="submit" disabled={request.status === "pending"} className="w-full">
        {request.status === "pending" ? t("sending") : t("submit")}
      </Button>
    </form>
  );
}
