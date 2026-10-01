"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { trackEvent } from "@/shared/analytics/track";
import { apiFetch } from "@/shared/api/client";
import { useApiMutation } from "@/shared/api/use-api-mutation";
import Button from "@/shared/ui/Button";

/** Formulario de login por magic link: pide el email y solicita el enlace. */
export default function LoginForm() {
  const t = useTranslations("auth.login");
  const [email, setEmail] = useState("");
  const request = useApiMutation();

  // Si se llega aquí desde un flujo OAuth (?returnTo=/authorize…), recuérdalo para
  // volver tras canjear el magic link. Solo rutas relativas (anti open-redirect).
  useEffect(() => {
    const returnTo = new URLSearchParams(window.location.search).get("returnTo");
    if (returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//")) {
      window.localStorage.setItem("sextante_return_to", returnTo);
    }
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const result = await request.run(() => apiFetch("/api/auth/request", { method: "POST", body: { email } }));
    if (result.ok) trackEvent({ name: "login-link-requested" });
  }

  if (request.status === "success") {
    return <p className="rounded-lg bg-accent-soft px-4 py-3 text-sm text-foreground">{t("sent")}</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm font-medium text-foreground">
          {t("emailLabel")}
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t("emailPlaceholder")}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
        />
      </div>

      {request.status === "error" && <p className="text-sm text-warning">{t("error")}</p>}

      <Button size="lg" type="submit" disabled={request.status === "pending"} className="w-full">
        {request.status === "pending" ? t("sending") : t("submit")}
      </Button>
    </form>
  );
}
