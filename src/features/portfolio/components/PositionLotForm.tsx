"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";

import { parseDecimalInput, sanitizeDecimalInput } from "@/core/number-input";
import type { LotPayload, PositionLot, PositionLotKind } from "@sextante/core/portfolio/types";

type Props = {
  /** Lote en edición, o `null` para dar de alta uno nuevo. */
  editing: PositionLot | null;
  /** Divisa de la posición: los importes del lote van SIEMPRE en ella. */
  currency: string;
  submitting: boolean;
  onSubmit: (payload: LotPayload) => void;
  onCancelEdit: () => void;
};

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-brand/30";

/** Fecha de hoy en UTC (`YYYY-MM-DD`), la misma referencia que usa `traded_at` en la API. */
function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Alta y edición de un lote. Los importes van en la divisa de la posición (un lote no tiene
 * divisa propia), así que la etiqueta la muestra pero no hay selector que elegir.
 *
 * La fecha es un `<input type="date">` nativo: da exactamente el `YYYY-MM-DD` que exige el DTO
 * y trae el calendario y la navegación por teclado del sistema, que ninguna implementación
 * propia igualaría.
 */
export default function PositionLotForm({ editing, currency, submitting, onSubmit, onCancelEdit }: Props) {
  const t = useTranslations("portfolio.lots");
  // Un id por instancia para poder etiquetar cada campo sin colisionar con el resto de la
  // página (hay otro formulario de posición debajo).
  const uid = useId();

  const [kind, setKind] = useState<PositionLotKind>(editing?.kind ?? "buy");
  const [tradedAt, setTradedAt] = useState(() => editing?.tradedAt ?? todayUtc());
  const [quantity, setQuantity] = useState(editing ? String(editing.quantity) : "");
  const [price, setPrice] = useState(editing ? String(editing.price) : "");
  const [fees, setFees] = useState(editing && editing.fees ? String(editing.fees) : "");
  const [note, setNote] = useState(editing?.note ?? "");

  const quantityNum = parseDecimalInput(quantity) ?? Number.NaN;
  const priceNum = parseDecimalInput(price) ?? Number.NaN;
  const feesNum = fees.trim() === "" ? 0 : (parseDecimalInput(fees) ?? Number.NaN);

  const isValid =
    Number.isFinite(quantityNum) &&
    quantityNum > 0 &&
    Number.isFinite(priceNum) &&
    priceNum >= 0 &&
    Number.isFinite(feesNum) &&
    feesNum >= 0 &&
    /^\d{4}-\d{2}-\d{2}$/.test(tradedAt);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!isValid) return;
    onSubmit({
      kind,
      quantity: quantityNum,
      price: priceNum,
      fees: feesNum,
      tradedAt,
      note: note.trim() || undefined,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-xl border border-border bg-surface-2 p-4">
      <h4 className="text-sm font-semibold text-foreground">{editing ? t("formEditTitle") : t("formAddTitle")}</h4>

      <div className="grid grid-cols-1 gap-3 @xs:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${uid}-kind`} className="text-sm font-medium text-foreground">
            {t("kind")}
          </label>
          <select
            id={`${uid}-kind`}
            value={kind}
            onChange={(e) => setKind(e.target.value as PositionLotKind)}
            className={inputClass}
          >
            <option value="buy">{t("kindBuy")}</option>
            <option value="sell">{t("kindSell")}</option>
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${uid}-date`} className="text-sm font-medium text-foreground">
            {t("tradedAt")}
          </label>
          <input
            id={`${uid}-date`}
            type="date"
            required
            value={tradedAt}
            onChange={(e) => setTradedAt(e.target.value)}
            className={inputClass}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${uid}-quantity`} className="text-sm font-medium text-foreground">
            {t("quantity")}
          </label>
          <input
            id={`${uid}-quantity`}
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
          <label htmlFor={`${uid}-price`} className="text-sm font-medium text-foreground">
            {t("price", { currency })}
          </label>
          <input
            id={`${uid}-price`}
            type="text"
            required
            inputMode="decimal"
            autoComplete="off"
            value={price}
            onChange={(e) => setPrice(sanitizeDecimalInput(e.target.value))}
            placeholder="0"
            className={inputClass}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${uid}-fees`} className="text-sm font-medium text-foreground">
            {t("fees", { currency })}
          </label>
          <input
            id={`${uid}-fees`}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={fees}
            onChange={(e) => setFees(sanitizeDecimalInput(e.target.value))}
            placeholder="0"
            className={inputClass}
          />
          <p className="text-xs text-muted">{t("feesHint")}</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${uid}-note`} className="text-sm font-medium text-foreground">
            {t("note")}
          </label>
          <input
            id={`${uid}-note`}
            type="text"
            maxLength={200}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("notePlaceholder")}
            className={inputClass}
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={submitting || !isValid}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-fg transition hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? t("saving") : editing ? t("save") : t("add")}
        </button>
        {editing && (
          <button
            type="button"
            onClick={onCancelEdit}
            disabled={submitting}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition hover:bg-surface disabled:opacity-50"
          >
            {t("cancel")}
          </button>
        )}
      </div>
    </form>
  );
}
