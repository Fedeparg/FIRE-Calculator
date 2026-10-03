"use client";

import { useTranslations } from "next-intl";

import { SUPPORTED_CURRENCIES, type SupportedCurrency } from "@sextante/core/contracts";
import { useFormat } from "@/shared/format/use-format";
import DecimalField from "@/shared/ui/DecimalField";
import FormField from "@/shared/ui/FormField";
import {
  ASSET_CLASSES,
  type AssetClass,
  type InstrumentSearchResult,
  type InstrumentType,
} from "@sextante/core/portfolio/types";
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
  /** Clase de activo deducida del buscador; `undefined` si el usuario escribió el símbolo a mano. */
  assetClass?: AssetClass;
};

/** Tipo del buscador → clase de activo de la declaración. */
const ASSET_CLASS_OF: Record<InstrumentType, AssetClass> = {
  equity: "stock",
  etf: "fund",
  fund: "fund",
  crypto: "other",
  index: "other",
  currency: "other",
  other: "other",
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
    onChange({
      ticker: result.symbol,
      name: values.name || result.name.slice(0, 100),
      assetClass: ASSET_CLASS_OF[result.type],
    });
  }

  const required = <span className="text-warning">*</span>;
  const brokerProblem = brokerRequired ? t("brokerRequired") : brokerEmptied ? t("brokerCannotEmpty") : undefined;

  return (
    <div className="grid grid-cols-1 gap-4">
      <FormField
        label={
          <>
            {t("ticker")} {required}
          </>
        }
        hint={t("tickerHint")}
      >
        {({ id }) => (
          <InstrumentSearchField
            id={id}
            value={values.ticker}
            onChange={(ticker) => onChange({ ticker, assetClass: undefined })}
            onSelect={handleSelect}
            placeholder={t("tickerPlaceholder")}
            inputClass={inputClass}
            maxLength={20}
          />
        )}
      </FormField>

      <FormField label={t("name")}>
        {(control) => (
          <input
            {...control}
            type="text"
            maxLength={100}
            value={values.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder={t("namePlaceholder")}
            className={inputClass}
          />
        )}
      </FormField>

      <FormField
        label={
          <>
            {t("quantity")} {required}
          </>
        }
      >
        {(control) => (
          <DecimalField {...control} required value={values.quantity} onChange={(quantity) => onChange({ quantity })} />
        )}
      </FormField>

      <FormField
        label={
          <>
            {t("avgPrice")} {required}
          </>
        }
      >
        {(control) => (
          <DecimalField {...control} required value={values.avgPrice} onChange={(avgPrice) => onChange({ avgPrice })} />
        )}
      </FormField>

      <FormField label={t("broker")} error={brokerProblem}>
        {(control) => (
          <input
            {...control}
            type="text"
            maxLength={100}
            value={values.broker}
            onChange={(e) => onChange({ broker: e.target.value })}
            placeholder={t("brokerPlaceholder")}
            className={`${inputClass} ${brokerProblem ? "border-warning" : ""}`}
          />
        )}
      </FormField>

      <FormField label={t("currency")}>
        {(control) => (
          <select
            {...control}
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
        )}
      </FormField>

      <FormField label={t("assetClass")} hint={t("assetClassHint")}>
        {(control) => (
          <select
            {...control}
            value={values.assetClass ?? ""}
            onChange={(e) => onChange({ assetClass: (e.target.value || undefined) as AssetClass | undefined })}
            className={inputClass}
          >
            <option value="">{t("assetClassUnknown")}</option>
            {ASSET_CLASSES.map((value) => (
              <option key={value} value={value}>
                {t(`assetClasses.${value}`)}
              </option>
            ))}
          </select>
        )}
      </FormField>
    </div>
  );
}
