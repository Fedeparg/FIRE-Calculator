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

/** What the user types into the position form (quantities as text). */
export type PositionFormValues = {
  ticker: string;
  name: string;
  quantity: string;
  avgPrice: string;
  broker: string;
  currency: SupportedCurrency;
  /** Asset class inferred from the search; `undefined` if the user typed the symbol by hand. */
  assetClass?: AssetClass;
};

/** Search type → tax-return asset class. */
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
  /** The symbol already exists and the broker is empty: one must be given to tell them apart. */
  brokerRequired: boolean;
  /** When editing, an attempt to clear a broker the position already had (not allowed). */
  brokerEmptied: boolean;
};

/** Position form fields. Presentational: state and submission live in `PositionForm`. */
export default function PositionFormFields({ values, onChange, brokerRequired, brokerEmptied }: Props) {
  const t = useTranslations("portfolio.form");
  const { currencyLabel } = useFormat();

  function handleSelect(result: InstrumentSearchResult) {
    // Prefill the name only if the user did not type their own. Truncated to 100:
    // Yahoo's `longname` can exceed it and the DTO (@MaxLength(100)) would return 400.
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
