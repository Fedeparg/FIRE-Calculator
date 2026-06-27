"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { PORTFOLIO_CURRENCIES, type Position } from "@/lib/portfolio";

type Status = "idle" | "submitting" | "error";

type Props = {
  /** Notifica al padre la posición creada para insertarla en la lista sin recargar. */
  onCreated: (position: Position) => void;
};

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-brand/30";

/** Formulario para añadir una posición. Valida en cliente y llama a POST /api/positions. */
export default function AddPositionForm({ onCreated }: Props) {
  const t = useTranslations("portfolio.form");

  const [ticker, setTicker] = useState("");
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [avgPrice, setAvgPrice] = useState("");
  const [broker, setBroker] = useState("");
  const [currency, setCurrency] = useState<(typeof PORTFOLIO_CURRENCIES)[number]>("EUR");
  const [status, setStatus] = useState<Status>("idle");

  // Los inputs numéricos son texto: parseamos y validamos en cliente antes de enviar.
  const quantityNum = Number(quantity.replace(",", "."));
  const avgPriceNum = Number(avgPrice.replace(",", "."));
  const isValid =
    ticker.trim().length > 0 &&
    Number.isFinite(quantityNum) &&
    quantityNum > 0 &&
    Number.isFinite(avgPriceNum) &&
    avgPriceNum >= 0;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!isValid) {
      setStatus("error");
      return;
    }
    setStatus("submitting");
    try {
      const res = await fetch("/api/positions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: ticker.trim(),
          name: name.trim() || undefined,
          // Enviamos números (no strings) para que @IsNumber del DTO los acepte.
          quantity: quantityNum,
          avgPrice: avgPriceNum,
          broker: broker.trim() || undefined,
          currency,
        }),
      });
      if (!res.ok) {
        setStatus("error");
        return;
      }
      const created = (await res.json()) as Position;
      onCreated(created);
      // Reinicia el formulario para la siguiente posición.
      setTicker("");
      setName("");
      setQuantity("");
      setAvgPrice("");
      setBroker("");
      setCurrency("EUR");
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-6"
    >
      <h2 className="text-lg font-semibold text-foreground">{t("title")}</h2>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="ticker" className="text-sm font-medium text-foreground">
            {t("ticker")} <span className="text-warning">*</span>
          </label>
          <input
            id="ticker"
            type="text"
            required
            maxLength={20}
            value={ticker}
            onChange={(e) => setTicker(e.target.value)}
            placeholder={t("tickerPlaceholder")}
            className={inputClass}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="name" className="text-sm font-medium text-foreground">
            {t("name")}
          </label>
          <input
            id="name"
            type="text"
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("namePlaceholder")}
            className={inputClass}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="quantity" className="text-sm font-medium text-foreground">
            {t("quantity")} <span className="text-warning">*</span>
          </label>
          <input
            id="quantity"
            type="number"
            required
            min="0"
            step="any"
            inputMode="decimal"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="0"
            className={inputClass}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="avgPrice" className="text-sm font-medium text-foreground">
            {t("avgPrice")} <span className="text-warning">*</span>
          </label>
          <input
            id="avgPrice"
            type="number"
            required
            min="0"
            step="any"
            inputMode="decimal"
            value={avgPrice}
            onChange={(e) => setAvgPrice(e.target.value)}
            placeholder="0"
            className={inputClass}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="broker" className="text-sm font-medium text-foreground">
            {t("broker")}
          </label>
          <input
            id="broker"
            type="text"
            maxLength={100}
            value={broker}
            onChange={(e) => setBroker(e.target.value)}
            placeholder={t("brokerPlaceholder")}
            className={inputClass}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="currency" className="text-sm font-medium text-foreground">
            {t("currency")}
          </label>
          <select
            id="currency"
            value={currency}
            onChange={(e) =>
              setCurrency(e.target.value as (typeof PORTFOLIO_CURRENCIES)[number])
            }
            className={inputClass}
          >
            {PORTFOLIO_CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      {status === "error" && <p className="text-sm text-warning">{t("error")}</p>}

      <button
        type="submit"
        disabled={status === "submitting" || !isValid}
        className="self-start rounded-lg bg-brand px-4 py-2.5 font-medium text-brand-fg transition hover:opacity-90 disabled:opacity-50"
      >
        {status === "submitting" ? t("submitting") : t("submit")}
      </button>
    </form>
  );
}
