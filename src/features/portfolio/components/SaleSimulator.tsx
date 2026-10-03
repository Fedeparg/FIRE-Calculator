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
  /** Histórico completo de la posición (compras y ventas). */
  lots: PositionLot[];
  /** Último precio de mercado del instrumento; puede venir en OTRA divisa. */
  price: PriceInfo | undefined;
  /** Tasas FX (USD por unidad de divisa). */
  rates: Record<string, number>;
};

/**
 * "¿Qué pasaría si vendo X participaciones a Y precio?": empareja la venta con los lotes por
 * FIFO (el criterio que exige Hacienda para valores homogéneos) y estima la cuota del ahorro.
 *
 * DIVISAS. Los lotes no tienen divisa propia: van en la de la posición, así que toda la
 * aritmética de la ganancia ocurre ahí sin convertir nada. La escala del IRPF, en cambio, está
 * en euros: si la posición está en otra divisa, la ganancia se convierte con las tasas de HOY
 * (no hay otra: la venta es hipotética y no tiene fecha). Si esa conversión no es posible se
 * muestra la ganancia y se dice que no se puede estimar la cuota, en vez de dar un número
 * falso, que es el criterio del resto de la aplicación.
 *
 * El precio de venta se prellena con la última cotización CONVERTIDA a la divisa de la
 * posición; si la conversión no es posible, no se prellena nada (meter dólares en una base de
 * coste en euros daría un resultado plausible y equivocado, que es lo peor que puede pasar).
 */
export default function SaleSimulator({ position, lots, price, rates }: Props) {
  const t = useTranslations("portfolio.sale");
  const { formatCurrency, formatSignedCurrency, formatPercent, formatQuantity, decimalSeparator } = useFormat();

  const currency = position.currency;

  // Última cotización llevada a la divisa de la posición; `null` si no es convertible.
  const suggestedPrice = useMemo(
    () => (price ? convertCurrency(price.close, price.currency, currency, rates) : null),
    [price, currency, rates],
  );

  // `useDecimalText` y no `String(n)`: este daría "1e-7" (que el saneado leería como 17) y el
  // punto decimal en castellano.
  const [quantity, setQuantity] = useDecimalText(position.quantity);
  // `null` = el usuario todavía no ha escrito nada, así que manda la sugerencia. Se deriva en
  // lugar de sincronizarse con un efecto: la cotización llega de forma asíncrona y un efecto
  // que escribiera el campo provocaría un render en cascada (y pisaría lo tecleado si el
  // precio llegase tarde).
  const [typedPrice, setTypedPrice] = useState<string | null>(null);
  const [fees, setFees] = useState("");

  // El precio sugerido se escribe con el separador decimal del idioma, como hace
  // `NumberField`. Con `String(...)` salía "12.214", que en castellano se lee como doce
  // mil doscientos catorce en vez de 12,214 €: un malentendido caro en una simulación
  // fiscal, justo donde el usuario está mirando una cifra de impuestos.
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

  // Ganancia llevada a euros para poder aplicar `IRPF_AHORRO`. `null` = no convertible.
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
