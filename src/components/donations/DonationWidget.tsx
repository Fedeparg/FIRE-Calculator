"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import {
  DONATION_MAX_EUR,
  DONATION_MIN_EUR,
  DONATION_PRESETS,
} from "./config";

type Status = "idle" | "loading" | "error";

/**
 * Widget de donación reutilizable (landing y /sobre-mi): importes sugeridos + cantidad
 * libre. Al confirmar, pide a la API una sesión de Stripe Checkout y redirige a su URL
 * alojada. El backend revalida el importe; aquí solo acotamos para una UX correcta.
 */
export default function DonationWidget() {
  const t = useTranslations("donations");
  const locale = useLocale();
  const [amount, setAmount] = useState<number>(DONATION_PRESETS[1]);
  const [status, setStatus] = useState<Status>("idle");

  const valid = Number.isInteger(amount) && amount >= DONATION_MIN_EUR && amount <= DONATION_MAX_EUR;

  async function handleDonate() {
    if (!valid) return;
    setStatus("loading");
    try {
      const res = await fetch("/api/donations/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, locale }),
      });
      if (!res.ok) throw new Error("checkout failed");
      const { url } = (await res.json()) as { url: string };
      window.location.href = url;
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-6">
      <p className="text-sm font-medium text-foreground">{t("widget.chooseAmount")}</p>

      <div className="mt-3 flex flex-wrap gap-2">
        {DONATION_PRESETS.map((preset) => {
          const selected = amount === preset;
          return (
            <button
              key={preset}
              type="button"
              onClick={() => setAmount(preset)}
              aria-pressed={selected}
              className={`rounded-xl border px-4 py-2 text-sm font-semibold transition-colors ${
                selected
                  ? "border-brand bg-brand text-brand-fg"
                  : "border-border bg-background text-foreground hover:border-brand"
              }`}
            >
              {preset} €
            </button>
          );
        })}

        <label className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-2 text-sm focus-within:border-brand">
          <span className="text-muted">{t("widget.customLabel")}</span>
          <input
            type="number"
            min={DONATION_MIN_EUR}
            max={DONATION_MAX_EUR}
            step={1}
            value={Number.isNaN(amount) ? "" : amount}
            onChange={(e) => setAmount(Math.floor(Number(e.target.value)))}
            className="w-16 bg-transparent text-foreground outline-none"
            aria-label={t("widget.customLabel")}
          />
          <span aria-hidden className="text-muted">
            €
          </span>
        </label>
      </div>

      <button
        type="button"
        onClick={handleDonate}
        disabled={!valid || status === "loading"}
        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-brand-fg transition hover:opacity-90 disabled:opacity-50 sm:w-auto"
      >
        {status === "loading" ? t("widget.redirecting") : t("widget.cta", { amount })}
      </button>

      {status === "error" && <p className="mt-2 text-sm text-warning">{t("widget.error")}</p>}

      <p className="mt-3 text-xs text-muted">{t("widget.secure")}</p>
    </div>
  );
}
