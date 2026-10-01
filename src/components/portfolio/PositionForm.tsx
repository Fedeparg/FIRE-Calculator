"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { trackEvent } from "@/components/analytics/track";
import { parseDecimalInput, sanitizeDecimalInput } from "@/core/number-input";
import { Link } from "@/i18n/navigation";
import { useFormat } from "@/lib/format";
import {
  PORTFOLIO_CURRENCIES,
  type InstrumentSearchResult,
  type Position,
  type PortfolioCurrency,
} from "@/lib/portfolio";
import InstrumentSearchField from "./InstrumentSearchField";

/** Id del título: da nombre al panel que contiene el formulario. */
export const POSITION_FORM_TITLE_ID = "position-form-title";

type Status = "idle" | "submitting" | "combining";

/** Tipo de error mostrado al usuario, derivado del fallo concreto (status o red). */
type ErrorKey =
  | "errorNetwork"
  | "errorSession"
  | "errorInvalid"
  | "errorServer"
  | "errorGeneric"
  | "errorHasSales";

/** Traduce un status HTTP a un mensaje específico (sin volcar el body crudo de la API). */
function errorKeyForStatus(status: number): ErrorKey {
  if (status === 401) return "errorSession";
  if (status === 400) return "errorInvalid";
  if (status >= 500) return "errorServer";
  return "errorGeneric";
}

type Props = {
  /** Si viene una posición, el formulario está en modo edición; si no, en modo alta. */
  editing?: Position | null;
  /** Alta correcta (201). */
  onCreated: (position: Position) => void;
  /** Edición o combinación correctas: reemplaza la posición existente en la lista. */
  onSaved: (position: Position) => void;
  /** Cancelar la edición y volver al modo alta. */
  onCancelEdit: () => void;
};

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-brand/30";

function toCurrency(value: string | undefined): PortfolioCurrency {
  return PORTFOLIO_CURRENCIES.includes(value as PortfolioCurrency)
    ? (value as PortfolioCurrency)
    : "EUR";
}

/**
 * Formulario de posición, reutilizado para alta y edición. En alta, si el símbolo ya
 * existe con el mismo bróker, la API responde 409 y mostramos un aviso con la opción de
 * combinar (media ponderada) sin perder lo escrito. El `key` del padre fuerza un remount
 * al cambiar de posición editada, así que el estado inicial siempre parte de `editing`.
 */
export default function PositionForm({ editing, onCreated, onSaved, onCancelEdit }: Props) {
  const t = useTranslations("portfolio.form");
  const { currencyLabel } = useFormat();
  const isEditing = Boolean(editing);

  const [ticker, setTicker] = useState(editing?.ticker ?? "");
  const [name, setName] = useState(editing?.name ?? "");
  const [quantity, setQuantity] = useState(editing ? String(editing.quantity) : "");
  const [avgPrice, setAvgPrice] = useState(editing ? String(editing.avgPrice) : "");
  const [broker, setBroker] = useState(editing?.broker ?? "");
  const [currency, setCurrency] = useState<PortfolioCurrency>(toCurrency(editing?.currency));
  const [status, setStatus] = useState<Status>("idle");
  const [errorKey, setErrorKey] = useState<ErrorKey | null>(null);
  // En alta: posición existente que colisiona (símbolo+bróker), para ofrecer combinar.
  const [duplicate, setDuplicate] = useState<Position | null>(null);
  // El símbolo ya existe y el bróker está vacío: hay que indicar uno para distinguirlo.
  const [brokerRequired, setBrokerRequired] = useState(false);
  // Al editar, intento de vaciar un bróker que la posición ya tenía (no se permite).
  const [brokerEmptied, setBrokerEmptied] = useState(false);

  const quantityNum = parseDecimalInput(quantity) ?? NaN;
  const avgPriceNum = parseDecimalInput(avgPrice) ?? NaN;
  // El bróker es opcional al añadir; la API lo exige solo si el símbolo ya existe.
  const isValid =
    ticker.trim().length > 0 &&
    Number.isFinite(quantityNum) &&
    quantityNum > 0 &&
    Number.isFinite(avgPriceNum) &&
    avgPriceNum >= 0;

  function resetForm() {
    setTicker("");
    setName("");
    setQuantity("");
    setAvgPrice("");
    setBroker("");
    setCurrency("EUR");
    setDuplicate(null);
    setBrokerRequired(false);
    setBrokerEmptied(false);
    setErrorKey(null);
    setStatus("idle");
  }

  const payload = () => ({
    ticker: ticker.trim(),
    name: name.trim() || undefined,
    quantity: quantityNum,
    avgPrice: avgPriceNum,
    broker: broker.trim() || undefined,
    currency,
  });

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setErrorKey(null);
    setDuplicate(null);
    setBrokerRequired(false);
    setBrokerEmptied(false);
    if (!isValid) {
      setErrorKey("errorInvalid");
      return;
    }
    // No se puede vaciar el bróker de una posición que ya lo tenía (el alta sí permite
    // crearla sin bróker; quitarlo después haría ambiguo el modelo de duplicados).
    if (isEditing && Boolean(editing?.broker) && broker.trim() === "") {
      setBrokerEmptied(true);
      return;
    }
    setStatus("submitting");
    try {
      const res = await fetch(
        isEditing ? `/api/positions/${editing!.id}` : "/api/positions",
        {
          method: isEditing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload()),
        },
      );

      if (res.ok) {
        const saved = (await res.json()) as Position;
        if (isEditing) {
          onSaved(saved);
        } else {
          onCreated(saved);
          resetForm();
          trackEvent({ name: "position-added" });
        }
        return;
      }

      // 409: tres casos según el `code`. DUPLICATE → ya existe ese símbolo+bróker (en alta
      // ofrecemos combinar). BROKER_REQUIRED → el símbolo ya existe y falta el bróker.
      // HAS_SALES → la posición tiene ventas y cambiar cantidad/precio a mano borraría su
      // histórico: hay que hacerlo desde sus operaciones.
      if (res.status === 409) {
        const body = (await res.json()) as { code?: string; existing?: Position };
        if (body.code === "HAS_SALES") {
          setErrorKey("errorHasSales");
          setStatus("idle");
          return;
        }
        if (body.code === "BROKER_REQUIRED") {
          setBrokerRequired(true);
          setStatus("idle");
          return;
        }
        if (body.code === "DUPLICATE" && body.existing && !isEditing) {
          setDuplicate(body.existing);
          setStatus("idle");
          return;
        }
      }
      // Resto de fallos: mensaje específico según el status (sesión, datos, servidor…).
      setErrorKey(errorKeyForStatus(res.status));
      setStatus("idle");
    } catch {
      // La promesa de fetch solo rechaza por fallo de red/conexión.
      setErrorKey("errorNetwork");
      setStatus("idle");
    }
  }

  /** Combina la compra actual con la posición existente que colisiona (media ponderada). */
  async function handleCombine() {
    if (!duplicate) return;
    setStatus("combining");
    setErrorKey(null);
    try {
      const res = await fetch(`/api/positions/${duplicate.id}/combine`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity: quantityNum, avgPrice: avgPriceNum, currency }),
      });
      if (res.ok) {
        const merged = (await res.json()) as Position;
        onSaved(merged);
        resetForm();
        return;
      }
      setErrorKey(errorKeyForStatus(res.status));
      setStatus("idle");
    } catch {
      setErrorKey("errorNetwork");
      setStatus("idle");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <h2 id={POSITION_FORM_TITLE_ID} className="pr-14 text-lg font-semibold text-foreground lg:pr-12">
        {isEditing ? t("editTitle", { ticker: editing!.ticker }) : t("title")}
      </h2>

      <div className="grid grid-cols-1 gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="ticker" className="text-sm font-medium text-foreground">
            {t("ticker")} <span className="text-warning">*</span>
          </label>
          <InstrumentSearchField
            id="ticker"
            value={ticker}
            onChange={setTicker}
            onSelect={(r: InstrumentSearchResult) => {
              setTicker(r.symbol);
              // Prefill del nombre solo si el usuario no escribió uno propio. Truncado a 100:
              // el `longname` de Yahoo puede excederlo y el DTO (@MaxLength(100)) daría 400.
              setName((prev) => prev || r.name.slice(0, 100));
            }}
            placeholder={t("tickerPlaceholder")}
            inputClass={inputClass}
            maxLength={20}
          />
          <p className="text-xs text-muted">{t("tickerHint")}</p>
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
            type="text"
            required
            inputMode="decimal"
            autoComplete="off"
            value={quantity}
            onChange={(e) => setQuantity(sanitizeDecimalInput(e.target.value))}
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
            type="text"
            required
            inputMode="decimal"
            autoComplete="off"
            value={avgPrice}
            onChange={(e) => setAvgPrice(sanitizeDecimalInput(e.target.value))}
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
            aria-invalid={brokerRequired || brokerEmptied}
            className={`${inputClass} ${brokerRequired || brokerEmptied ? "border-warning" : ""}`}
          />
          {brokerRequired && (
            <p className="text-xs text-warning">{t("brokerRequired")}</p>
          )}
          {brokerEmptied && (
            <p className="text-xs text-warning">{t("brokerCannotEmpty")}</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="currency" className="text-sm font-medium text-foreground">
            {t("currency")}
          </label>
          <select
            id="currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value as PortfolioCurrency)}
            className={inputClass}
          >
            {PORTFOLIO_CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {currencyLabel(c)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {duplicate && (
        <div className="flex flex-col gap-2 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3">
          <p className="text-sm text-foreground">
            {t("duplicate", { ticker: duplicate.ticker, broker: duplicate.broker ?? "" })}
          </p>
          <p className="text-xs text-muted">{t("duplicateHint")}</p>
          <button
            type="button"
            onClick={handleCombine}
            disabled={status === "combining"}
            className="self-start rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-brand-fg transition hover:opacity-90 disabled:opacity-50"
          >
            {status === "combining" ? t("combining") : t("combine")}
          </button>
        </div>
      )}

      {errorKey && (
        <p className="text-sm text-warning">
          {t(errorKey)}
          {errorKey === "errorSession" && (
            <>
              {" "}
              <Link
                href="/entrar"
                className="font-medium text-brand underline underline-offset-2"
              >
                {t("errorSessionLink")}
              </Link>
            </>
          )}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={status !== "idle" || !isValid}
          className="rounded-lg bg-brand px-4 py-2.5 font-medium text-brand-fg transition hover:opacity-90 disabled:opacity-50"
        >
          {isEditing
            ? status === "submitting"
              ? t("saving")
              : t("save")
            : status === "submitting"
              ? t("submitting")
              : t("submit")}
        </button>
        {isEditing && (
          <button
            type="button"
            onClick={onCancelEdit}
            className="rounded-lg border border-border px-4 py-2.5 font-medium text-foreground transition hover:bg-surface-2"
          >
            {t("cancel")}
          </button>
        )}
      </div>
    </form>
  );
}
