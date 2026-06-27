"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

type Status = "idle" | "sending" | "sent" | "error";

/** Formulario de login por magic link: pide el email y solicita el enlace. */
export default function LoginForm() {
  const t = useTranslations("auth.login");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setStatus("sending");
    try {
      const res = await fetch("/api/auth/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setStatus(res.ok ? "sent" : "error");
    } catch {
      setStatus("error");
    }
  }

  if (status === "sent") {
    return (
      <p className="rounded-lg bg-accent-soft px-4 py-3 text-sm text-foreground">
        {t("sent")}
      </p>
    );
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

      {status === "error" && (
        <p className="text-sm text-warning">{t("error")}</p>
      )}

      <button
        type="submit"
        disabled={status === "sending"}
        className="w-full rounded-lg bg-brand px-4 py-2.5 font-medium text-brand-fg transition hover:opacity-90 disabled:opacity-50"
      >
        {status === "sending" ? t("sending") : t("submit")}
      </button>
    </form>
  );
}
