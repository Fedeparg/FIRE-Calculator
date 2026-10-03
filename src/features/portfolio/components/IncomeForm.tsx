"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";

import { INCOME_KINDS, type IncomeEvent, type IncomeKind, type IncomePayload } from "@sextante/core/fiscal/income";
import { SUPPORTED_CURRENCIES } from "@sextante/core/contracts";
import { formatDecimalInput, parseDecimalInput, sanitizeDecimalInput } from "@/shared/format/number-input";
import { useFormat } from "@/shared/format/use-format";
import { inputClass } from "@/shared/ui/field-classes";
import Button from "@/shared/ui/Button";

type Props = {
  /** Cobro en edición, o `null` para dar de alta uno nuevo. */
  editing: IncomeEvent | null;
  /** Valores de partida del alta: el panel de una posición fija posición, ISIN, país y divisa. */
  defaults: Pick<IncomePayload, "kind" | "positionId" | "isin" | "name" | "country" | "currency">;
  submitting: boolean;
  onSubmit: (payload: IncomePayload) => void;
  onCancelEdit: () => void;
};

const todayUtc = () => new Date().toISOString().slice(0, 10);

/**
 * Alta y edición de un cobro: dividendo, interés o recompensa del bróker. La retención en origen
 * vacía significa "no la sé" (distinto de 0): el informe avisa de que sin ella no se puede
 * calcular la deducción por doble imposición.
 */
export default function IncomeForm({ editing, defaults, submitting, onSubmit, onCancelEdit }: Props) {
  const t = useTranslations("portfolio.income");
  const uid = useId();
  const { decimalSeparator } = useFormat();
  // `formatDecimalInput` y no `String(n)`: este daría "1e-7", que el saneado leería como 17.
  const asText = (value: number | null | undefined) =>
    value === null || value === undefined ? "" : formatDecimalInput(value, decimalSeparator);

  const [kind, setKind] = useState<IncomeKind>(editing?.kind ?? defaults.kind);
  const [paidAt, setPaidAt] = useState(() => editing?.paidAt ?? todayUtc());
  const [currency, setCurrency] = useState(editing?.currency ?? defaults.currency ?? "EUR");
  const [gross, setGross] = useState(asText(editing?.gross));
  const [origin, setOrigin] = useState(asText(editing ? editing.withholdingOrigin : 0));
  const [spain, setSpain] = useState(asText(editing?.withholdingSpain ?? 0));
  const [country, setCountry] = useState(editing?.country ?? defaults.country ?? "");
  const [name, setName] = useState(editing?.name ?? defaults.name ?? "");
  const [reported, setReported] = useState(editing?.reportedToAeat ?? false);

  const grossNum = parseDecimalInput(gross) ?? Number.NaN;
  const originNum = origin.trim() === "" ? null : (parseDecimalInput(origin) ?? Number.NaN);
  const spainNum = spain.trim() === "" ? 0 : (parseDecimalInput(spain) ?? Number.NaN);
  const countryCode = country.trim().toUpperCase();

  const withholdingsValid =
    (originNum === null || (Number.isFinite(originNum) && originNum >= 0)) &&
    Number.isFinite(spainNum) &&
    spainNum >= 0;
  const isValid =
    Number.isFinite(grossNum) &&
    grossNum > 0 &&
    withholdingsValid &&
    (originNum ?? 0) + spainNum <= grossNum &&
    (countryCode === "" || /^[A-Z]{2}$/.test(countryCode)) &&
    /^\d{4}-\d{2}-\d{2}$/.test(paidAt);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!isValid) return;
    onSubmit({
      kind,
      paidAt,
      positionId: editing ? editing.positionId : (defaults.positionId ?? null),
      isin: editing ? editing.isin : (defaults.isin ?? null),
      name: name.trim() || null,
      country: countryCode || null,
      currency,
      gross: grossNum,
      withholdingOrigin: originNum,
      withholdingSpain: spainNum,
      reportedToAeat: reported,
    });
  }

  const field = (id: string, label: string, input: React.ReactNode, hint?: string) => (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={`${uid}-${id}`} className="text-sm font-medium text-foreground">
        {label}
      </label>
      {input}
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
  const decimalInput = (id: string, value: string, set: (v: string) => void, required = false) => (
    <input
      id={`${uid}-${id}`}
      type="text"
      required={required}
      inputMode="decimal"
      autoComplete="off"
      value={value}
      onChange={(e) => set(sanitizeDecimalInput(e.target.value))}
      placeholder="0"
      className={inputClass}
    />
  );

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-xl border border-border bg-surface-2 p-4">
      <h4 className="text-sm font-semibold text-foreground">{editing ? t("formEditTitle") : t("formAddTitle")}</h4>

      <div className="grid grid-cols-1 gap-3 @xs:grid-cols-2">
        {field(
          "kind",
          t("kind"),
          <select
            id={`${uid}-kind`}
            value={kind}
            onChange={(e) => setKind(e.target.value as IncomeKind)}
            className={inputClass}
          >
            {INCOME_KINDS.map((option) => (
              <option key={option} value={option}>
                {t(`kinds.${option}`)}
              </option>
            ))}
          </select>,
        )}
        {field(
          "date",
          t("paidAt"),
          <input
            id={`${uid}-date`}
            type="date"
            required
            value={paidAt}
            onChange={(e) => setPaidAt(e.target.value)}
            className={inputClass}
          />,
        )}
        {field("gross", t("gross"), decimalInput("gross", gross, setGross, true))}
        {field(
          "currency",
          t("currency"),
          <select
            id={`${uid}-currency`}
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className={inputClass}
          >
            {SUPPORTED_CURRENCIES.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>,
        )}
        {field("origin", t("withholdingOrigin"), decimalInput("origin", origin, setOrigin), t("withholdingOriginHint"))}
        {field("spain", t("withholdingSpain"), decimalInput("spain", spain, setSpain))}
        {field(
          "country",
          t("country"),
          <input
            id={`${uid}-country`}
            type="text"
            maxLength={2}
            autoComplete="off"
            value={country}
            onChange={(e) => setCountry(e.target.value.toUpperCase())}
            placeholder="US"
            className={inputClass}
          />,
          t("countryHint"),
        )}
        {field(
          "name",
          t("name"),
          <input
            id={`${uid}-name`}
            type="text"
            maxLength={100}
            autoComplete="off"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
          />,
        )}
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

      {gross.trim() !== "" && Number.isFinite(grossNum) && withholdingsValid && !isValid && (
        <p className="text-sm text-warning">{t("invalid")}</p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={!isValid || submitting}>
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
