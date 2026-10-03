"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { todayUtc } from "@sextante/core/dates";
import type { LotPayload, PositionLot, PositionLotKind } from "@sextante/core/portfolio/types";
import { validateLotForm } from "@/features/portfolio/model/form-validation";
import Button from "@/shared/ui/Button";
import DecimalField, { useDecimalText } from "@/shared/ui/DecimalField";
import { inputClass } from "@/shared/ui/field-classes";
import FormField from "@/shared/ui/FormField";

type Props = {
  /** Lot being edited, or `null` to create a new one. */
  editing: PositionLot | null;
  /** Position currency: the lot's amounts are ALWAYS in it. */
  currency: string;
  submitting: boolean;
  onSubmit: (payload: LotPayload) => void;
  onCancelEdit: () => void;
};

/**
 * Creates and edits a lot. Amounts are in the position's currency (a lot has no currency of its
 * own), so the label shows it but there is no selector to pick one.
 *
 * The date is a native `<input type="date">`: it yields exactly the `YYYY-MM-DD` the DTO requires
 * and brings the system calendar and keyboard navigation, which no custom implementation would
 * match.
 */
export default function PositionLotForm({ editing, currency, submitting, onSubmit, onCancelEdit }: Props) {
  const t = useTranslations("portfolio.lots");
  const [kind, setKind] = useState<PositionLotKind>(editing?.kind ?? "buy");
  const [tradedAt, setTradedAt] = useState(() => editing?.tradedAt ?? todayUtc());
  const [quantity, setQuantity] = useDecimalText(editing?.quantity);
  const [price, setPrice] = useDecimalText(editing?.price);
  // Without fees the field starts empty (not "0"): empty also counts as 0.
  const [fees, setFees] = useDecimalText(editing?.fees || null);
  const [note, setNote] = useState(editing?.note ?? "");

  const amounts = validateLotForm({ quantity, price, fees, tradedAt });

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!amounts) return;
    onSubmit({ kind, ...amounts, tradedAt, note: note.trim() || undefined });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-xl border border-border bg-surface-2 p-4">
      <h4 className="text-sm font-semibold text-foreground">{editing ? t("formEditTitle") : t("formAddTitle")}</h4>

      <div className="grid grid-cols-1 gap-3 @xs:grid-cols-2">
        <FormField label={t("kind")}>
          {(control) => (
            <select
              {...control}
              value={kind}
              onChange={(e) => setKind(e.target.value as PositionLotKind)}
              className={inputClass}
            >
              <option value="buy">{t("kindBuy")}</option>
              <option value="sell">{t("kindSell")}</option>
            </select>
          )}
        </FormField>

        <FormField label={t("tradedAt")}>
          {(control) => (
            <input
              {...control}
              type="date"
              required
              value={tradedAt}
              onChange={(e) => setTradedAt(e.target.value)}
              className={inputClass}
            />
          )}
        </FormField>

        <FormField label={t("quantity")}>
          {(control) => <DecimalField {...control} required value={quantity} onChange={setQuantity} />}
        </FormField>

        <FormField label={t("price", { currency })}>
          {(control) => <DecimalField {...control} required value={price} onChange={setPrice} />}
        </FormField>

        <FormField label={t("fees", { currency })} hint={t("feesHint")}>
          {(control) => <DecimalField {...control} value={fees} onChange={setFees} />}
        </FormField>

        <FormField label={t("note")}>
          {(control) => (
            <input
              {...control}
              type="text"
              maxLength={200}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("notePlaceholder")}
              className={inputClass}
            />
          )}
        </FormField>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={submitting || !amounts}>
          {submitting ? t("saving") : editing ? t("save") : t("add")}
        </Button>
        {editing && (
          <Button variant="secondary" onClick={onCancelEdit} disabled={submitting}>
            {t("cancel")}
          </Button>
        )}
      </div>
    </form>
  );
}
