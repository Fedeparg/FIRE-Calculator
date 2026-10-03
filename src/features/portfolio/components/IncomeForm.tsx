"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { INCOME_KINDS, type IncomeEvent, type IncomeKind, type IncomePayload } from "@sextante/core/fiscal/income";
import { SUPPORTED_CURRENCIES } from "@sextante/core/contracts";
import { todayUtc } from "@sextante/core/dates";
import { validateIncomeForm } from "@/features/portfolio/model/form-validation";
import Button from "@/shared/ui/Button";
import DecimalField, { useDecimalText } from "@/shared/ui/DecimalField";
import { inputClass } from "@/shared/ui/field-classes";
import FormField from "@/shared/ui/FormField";

type Props = {
  /** Cobro en edición, o `null` para dar de alta uno nuevo. */
  editing: IncomeEvent | null;
  /** Valores de partida del alta: el panel de una posición fija posición, ISIN, país y divisa. */
  defaults: Pick<IncomePayload, "kind" | "positionId" | "isin" | "name" | "country" | "currency">;
  submitting: boolean;
  onSubmit: (payload: IncomePayload) => void;
  onCancelEdit: () => void;
};

/**
 * Alta y edición de un cobro: dividendo, interés o recompensa del bróker. La retención en origen
 * vacía significa "no la sé" (distinto de 0): el informe avisa de que sin ella no se puede
 * calcular la deducción por doble imposición.
 */
export default function IncomeForm({ editing, defaults, submitting, onSubmit, onCancelEdit }: Props) {
  const t = useTranslations("portfolio.income");
  const [kind, setKind] = useState<IncomeKind>(editing?.kind ?? defaults.kind);
  const [paidAt, setPaidAt] = useState(() => editing?.paidAt ?? todayUtc());
  const [currency, setCurrency] = useState(editing?.currency ?? defaults.currency ?? "EUR");
  const [gross, setGross] = useDecimalText(editing?.gross);
  // En edición, la retención en origen puede ser `null` ("no la sé"): el campo queda vacío.
  const [origin, setOrigin] = useDecimalText(editing ? editing.withholdingOrigin : 0);
  const [spain, setSpain] = useDecimalText(editing?.withholdingSpain ?? 0);
  const [country, setCountry] = useState(editing?.country ?? defaults.country ?? "");
  const [name, setName] = useState(editing?.name ?? defaults.name ?? "");
  const [reported, setReported] = useState(editing?.reportedToAeat ?? false);

  const validation = validateIncomeForm({ gross, origin, spain, country, paidAt });

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!validation.ok) return;
    onSubmit({
      kind,
      paidAt,
      positionId: editing ? editing.positionId : (defaults.positionId ?? null),
      isin: editing ? editing.isin : (defaults.isin ?? null),
      name: name.trim() || null,
      currency,
      reportedToAeat: reported,
      ...validation.value,
    });
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
              onChange={(e) => setKind(e.target.value as IncomeKind)}
              className={inputClass}
            >
              {INCOME_KINDS.map((option) => (
                <option key={option} value={option}>
                  {t(`kinds.${option}`)}
                </option>
              ))}
            </select>
          )}
        </FormField>
        <FormField label={t("paidAt")}>
          {(control) => (
            <input
              {...control}
              type="date"
              required
              value={paidAt}
              onChange={(e) => setPaidAt(e.target.value)}
              className={inputClass}
            />
          )}
        </FormField>
        <FormField label={t("gross")}>
          {(control) => <DecimalField {...control} required value={gross} onChange={setGross} />}
        </FormField>
        <FormField label={t("currency")}>
          {(control) => (
            <select {...control} value={currency} onChange={(e) => setCurrency(e.target.value)} className={inputClass}>
              {SUPPORTED_CURRENCIES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          )}
        </FormField>
        <FormField label={t("withholdingOrigin")} hint={t("withholdingOriginHint")}>
          {(control) => <DecimalField {...control} value={origin} onChange={setOrigin} />}
        </FormField>
        <FormField label={t("withholdingSpain")}>
          {(control) => <DecimalField {...control} value={spain} onChange={setSpain} />}
        </FormField>
        <FormField label={t("country")} hint={t("countryHint")}>
          {(control) => (
            <input
              {...control}
              type="text"
              maxLength={2}
              autoComplete="off"
              value={country}
              onChange={(e) => setCountry(e.target.value.toUpperCase())}
              placeholder="US"
              className={inputClass}
            />
          )}
        </FormField>
        <FormField label={t("name")}>
          {(control) => (
            <input
              {...control}
              type="text"
              maxLength={100}
              autoComplete="off"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
            />
          )}
        </FormField>
      </div>

      <label className="flex items-start gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={reported}
          onChange={(e) => setReported(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-brand"
        />
        <span>{t("reportedToAeat")}</span>
      </label>

      {!validation.ok && validation.reason === "inconsistent" && <p className="text-sm text-warning">{t("invalid")}</p>}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={!validation.ok || submitting}>
          {submitting ? t("saving") : editing ? t("save") : t("add")}
        </Button>
        {editing && (
          <Button type="button" variant="secondary" onClick={onCancelEdit}>
            {t("cancel")}
          </Button>
        )}
      </div>
    </form>
  );
}
