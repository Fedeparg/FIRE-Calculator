"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import Notice from "@/shared/ui/Notice";
import { FISCAL_YEAR_LABEL } from "@sextante/core/fiscal/brackets";
import { TAX_CURRENCY } from "@sextante/core/fiscal/fx-reference";
import { simulateSale, type TradeLot } from "@sextante/core/fiscal/plusvalias";
import { estimateSavingsTax } from "@sextante/core/fiscal/savings-tax";
import { formatIsoDate } from "@/shared/format/format";
import { convertCurrency } from "@sextante/core/fx";
import { formatDecimalInput, parseDecimalInput } from "@/shared/format/number-input";
import { signedTone } from "@/shared/format/signed-tone";
import { useFormat } from "@/shared/format/use-format";
import type { PositionLot, PriceInfo, Position } from "@sextante/core/portfolio/types";
import SaleMatchesTable from "./SaleMatchesTable";
import DecimalField, { useDecimalText } from "@/shared/ui/DecimalField";
import FormField from "@/shared/ui/FormField";

type Props = {
  position: Position;
  /** Full history of the position (purchases and sales). */
  lots: PositionLot[];
  /** Last market price of the instrument; it may be in ANOTHER currency. */
  price: PriceInfo | undefined;
  /** FX rates (USD per currency unit). */
  rates: Record<string, number>;
};

/**
 * "What would happen if I sell X shares at price Y?": matches the sale against the lots by FIFO
 * (the rule the Spanish tax agency requires for homogeneous securities) and estimates the savings
 * tax due.
 *
 * CURRENCIES. Lots have no currency of their own: they use the position's, so all the gain
 * arithmetic happens there without converting anything. The IRPF scale, however, is in euros: if
 * the position is in another currency, the gain is converted at TODAY's rates (there is no
 * alternative: the sale is hypothetical and has no date). If that conversion is not possible, the
 * gain is shown and we say the tax cannot be estimated, instead of giving a false number, which
 * is the rule across the rest of the app.
 *
 * The sale price is prefilled with the last quote CONVERTED to the position's currency; if the
 * conversion is not possible, nothing is prefilled (putting dollars into a euro cost basis would
 * give a plausible but wrong result, which is the worst thing that can happen).
 */
export default function SaleSimulator({ position, lots, price, rates }: Props) {
  const t = useTranslations("portfolio.sale");
  const { formatCurrency, formatSignedCurrency, formatPercent, formatQuantity, decimalSeparator } = useFormat();

  const currency = position.currency;

  // Last quote converted to the position's currency; `null` if not convertible.
  const suggestedPrice = useMemo(
    () => (price ? convertCurrency(price.close, price.currency, currency, rates) : null),
    [price, currency, rates],
  );

  // `useDecimalText` and not `String(n)`: the latter would give "1e-7" (which sanitizing would read as 17) and the
  // wrong decimal point for Spanish.
  const [quantity, setQuantity] = useDecimalText(position.quantity);
  // `null` = the user has not typed anything yet, so the suggestion wins. It is derived instead
  // of being synced through an effect: the quote arrives asynchronously, and an effect
  // writing the field would cause a cascading render (and overwrite what was typed if the
  // price arrived late).
  const [typedPrice, setTypedPrice] = useState<string | null>(null);
  const [fees, setFees] = useState("");

  // The suggested price is written with the locale's decimal separator, as
  // `NumberField` does. With `String(...)` it came out as "12.214", which in Spanish reads as twelve
  // thousand two hundred fourteen instead of 12,214 €: a costly misunderstanding in a tax
  // simulation, right where the user is looking at a tax figure.
  const priceText =
    typedPrice ??
    (suggestedPrice !== null ? formatDecimalInput(Number(suggestedPrice.toFixed(6)), decimalSeparator) : "");

  const quantityNum = parseDecimalInput(quantity) ?? Number.NaN;
  const priceNum = parseDecimalInput(priceText) ?? Number.NaN;
  const feesNum = fees.trim() === "" ? 0 : (parseDecimalInput(fees) ?? Number.NaN);

  const tradeLots: TradeLot[] = useMemo(
    () =>
      lots.map((lot) => ({
        id: lot.id,
        kind: lot.kind,
        quantity: lot.quantity,
        price: lot.price,
        fees: lot.fees,
        tradedAt: lot.tradedAt,
        createdAt: lot.createdAt,
      })),
    [lots],
  );

  const simulation = useMemo(
    () =>
      simulateSale({
        lots: tradeLots,
        quantity: quantityNum,
        price: priceNum,
        fees: Number.isFinite(feesNum) ? feesNum : 0,
      }),
    [tradeLots, quantityNum, priceNum, feesNum],
  );

  // Gain converted to euros so `IRPF_SAVINGS_SCALE` can be applied. `null` = not convertible.
  const gainInEur =
    simulation && !simulation.insufficient ? convertCurrency(simulation.gain, currency, TAX_CURRENCY, rates) : null;
  const tax = gainInEur !== null ? estimateSavingsTax(gainInEur) : null;

  const showResults = simulation !== null && !simulation.insufficient;

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-col gap-1">
        <h4 className="text-sm font-semibold text-foreground">{t("title")}</h4>
        <p className="text-xs text-muted">{t("intro")}</p>
      </div>

      <div className="grid grid-cols-1 gap-3 @md:grid-cols-3">
        <FormField label={t("quantity")} hint={t("available", { quantity: formatQuantity(position.quantity) })}>
          {(control) => <DecimalField {...control} value={quantity} onChange={setQuantity} />}
        </FormField>

        <FormField
          label={t("price", { currency })}
          hint={
            price === undefined
              ? t("noPrice")
              : suggestedPrice === null
                ? t("priceNotConvertible", { from: price.currency, to: currency })
                : t("priceFrom", { date: formatIsoDate(price.date) })
          }
        >
          {(control) => <DecimalField {...control} value={priceText} onChange={setTypedPrice} />}
        </FormField>

        <FormField label={t("fees", { currency })}>
          {(control) => <DecimalField {...control} value={fees} onChange={setFees} />}
        </FormField>
      </div>

      {simulation === null && <p className="text-sm text-muted">{t("incomplete")}</p>}

      {simulation !== null && simulation.insufficient && (
        <p className="text-sm text-warning">
          {t("insufficient", { available: formatQuantity(simulation.availableQuantity) })}
        </p>
      )}

      {showResults && (
        <>
          <dl className="grid grid-cols-2 gap-4 @lg:grid-cols-3">
            <div className="flex flex-col gap-1">
              <dt className="text-sm text-muted">{t("transferValue")}</dt>
              <dd className="text-lg font-semibold tabular-nums text-foreground">
                {formatCurrency(simulation.transferValue, currency)}
              </dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-sm text-muted">{t("acquisitionValue")}</dt>
              <dd className="text-lg font-semibold tabular-nums text-foreground">
                {formatCurrency(simulation.acquisitionValue, currency)}
              </dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-sm text-muted">{simulation.gain < 0 ? t("loss") : t("gain")}</dt>
              <dd className={`text-lg font-semibold tabular-nums ${signedTone(simulation.gain)}`}>
                {formatSignedCurrency(simulation.gain, currency)}
              </dd>
            </div>
          </dl>

          {tax === null ? (
            <p className="text-sm text-warning">{t("taxNotConvertible", { from: currency, to: TAX_CURRENCY })}</p>
          ) : (
            <dl className="grid grid-cols-2 gap-4 rounded-lg border border-border bg-surface-2 p-4 @lg:grid-cols-3">
              <div className="flex flex-col gap-1">
                <dt className="text-sm text-muted">{t("taxBase")}</dt>
                <dd className="text-lg font-semibold tabular-nums text-foreground">
                  {formatCurrency(tax.base, TAX_CURRENCY)}
                </dd>
              </div>
              <div className="flex flex-col gap-1">
                <dt className="text-sm text-muted">{t("tax", { year: FISCAL_YEAR_LABEL })}</dt>
                <dd className="text-lg font-semibold tabular-nums text-foreground">
                  {formatCurrency(tax.tax, TAX_CURRENCY)}
                  {tax.effectiveRate !== null && (
                    <span className="ml-1.5 text-sm font-medium text-muted">({formatPercent(tax.effectiveRate)})</span>
                  )}
                </dd>
              </div>
              <div className="flex flex-col gap-1">
                <dt className="text-sm text-muted">{t("net")}</dt>
                <dd className="text-lg font-semibold tabular-nums text-foreground">
                  {formatCurrency(tax.net, TAX_CURRENCY)}
                </dd>
              </div>
            </dl>
          )}

          {simulation.matched.length > 0 && <SaleMatchesTable matched={simulation.matched} currency={currency} />}

          <p className="text-sm text-muted">
            {t("remaining", {
              quantity: formatQuantity(simulation.remainingQuantity),
              avgPrice: formatCurrency(simulation.remainingAvgPrice, currency),
            })}
          </p>
        </>
      )}

      <Notice>
        {t("disclaimer")}
        {currency !== TAX_CURRENCY && ` ${t("disclaimerFx", { currency })}`}
      </Notice>
    </section>
  );
}
