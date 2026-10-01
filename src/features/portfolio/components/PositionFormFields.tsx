"use client";

import { useTranslations } from "next-intl";

import { SUPPORTED_CURRENCIES, type SupportedCurrency } from "@sextante/core/contracts";
import { sanitizeDecimalInput } from "@/shared/format/number-input";
import { useFormat } from "@/shared/format/use-format";
import type { InstrumentSearchResult } from "@sextante/core/portfolio/types";
import InstrumentSearchField from "./InstrumentSearchField";
import { inputClass } from "@/shared/ui/field-classes";

/** Lo que el usuario teclea en el formulario de posición (las cantidades, como texto). */
export type PositionFormValues = {
  ticker: string;
  name: string;
  quantity: string;
  avgPrice: string;
  broker: string;
  currency: SupportedCurrency;
};

type Props = {
  values: PositionFormValues;
  onChange: (patch: Partial<PositionFormValues>) => void;
  /** El símbolo ya existe y el bróker está vacío: hay que indicar uno para distinguirlo. */
  brokerRequired: boolean;
  /** Al editar, intento de vaciar un bróker que la posición ya tenía (no se permite). */
  brokerEmptied: boolean;
};

/** Campos del formulario de posición. Presentacional: el estado y el envío viven en `PositionForm`. */
export default function PositionFormFields({ values, onChange, brokerRequired, brokerEmptied }: Props) {
  const t = useTranslations("portfolio.form");
  const { currencyLabel } = useFormat();

  function handleSelect(result: InstrumentSearchResult) {
    // Prefill del nombre solo si el usuario no escribió uno propio. Truncado a 100:
    // el `longname` de Yahoo puede excederlo y el DTO (@MaxLength(100)) daría 400.
    onChange({ ticker: result.symbol, name: values.name || result.name.slice(0, 100) });
  }

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="ticker" className="text-sm font-medium text-foreground">
          {t("ticker")} <span className="text-warning">*</span>
        </label>
        <InstrumentSearchField
          id="ticker"
          value={values.ticker}
          onChange={(ticker) => onChange({ ticker })}
          onSelect={handleSelect}
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
          value={values.name}
          onChange={(e) => onChange({ name: e.target.value })}
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
          value={values.quantity}
          onChange={(e) => onChange({ quantity: sanitizeDecimalInput(e.target.value) })}
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
          value={values.avgPrice}
          onChange={(e) => onChange({ avgPrice: sanitizeDecimalInput(e.target.value) })}
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
          value={values.broker}
          onChange={(e) => onChange({ broker: e.target.value })}
          placeholder={t("brokerPlaceholder")}
          aria-invalid={brokerRequired || brokerEmptied}
          className={`${inputClass} ${brokerRequired || brokerEmptied ? "border-warning" : ""}`}
        />
        {brokerRequired && <p className="text-xs text-warning">{t("brokerRequired")}</p>}
        {brokerEmptied && <p className="text-xs text-warning">{t("brokerCannotEmpty")}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="currency" className="text-sm font-medium text-foreground">
          {t("currency")}
        </label>
        <select
          id="currency"
          value={values.currency}
          onChange={(e) => onChange({ currency: e.target.value as SupportedCurrency })}
          className={inputClass}
        >
          {SUPPORTED_CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {currencyLabel(c)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
