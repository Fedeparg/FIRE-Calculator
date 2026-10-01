"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import Notice from "@/components/ui/Notice";
import { FISCAL_YEAR_LABEL } from "@sextante/core/fiscal/brackets";
import { estimateSavingsTax, simulateSale, type TradeLot } from "@sextante/core/fiscal/plusvalias";
import { formatIsoDate } from "@/core/format";
import { convertCurrency } from "@sextante/core/fx";
import { formatDecimalInput, parseDecimalInput, sanitizeDecimalInput } from "@/core/number-input";
import { useFormat } from "@/lib/format";
import type { PositionLot, PriceInfo, Position } from "@sextante/core/portfolio/types";
import SaleMatchesTable from "./SaleMatchesTable";

type Props = {
  position: Position;
  /** Histórico completo de la posición (compras y ventas). */
  lots: PositionLot[];
  /** Último precio de mercado del instrumento; puede venir en OTRA divisa. */
  price: PriceInfo | undefined;
  /** Tasas FX (USD por unidad de divisa). */
  rates: Record<string, number>;
};

/** Divisa en la que está expresada la escala del ahorro del IRPF. */
const TAX_CURRENCY = "EUR";

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-brand/30";

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
  const { formatCurrency, formatPercent, formatQuantity, decimalSeparator } = useFormat();

  const currency = position.currency;

  // Última cotización llevada a la divisa de la posición; `null` si no es convertible.
  const suggestedPrice = useMemo(
    () => (price ? convertCurrency(price.close, price.currency, currency, rates) : null),
    [price, currency, rates],
  );

  const [quantity, setQuantity] = useState(() => String(position.quantity));
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
  const gainColor =
    simulation && simulation.gain > 0
      ? "text-success"
      : simulation && simulation.gain < 0
        ? "text-danger"
        : "text-foreground";

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-col gap-1">
        <h4 className="text-sm font-semibold text-foreground">{t("title")}</h4>
        <p className="text-xs text-muted">{t("intro")}</p>
      </div>

      <div className="grid grid-cols-1 gap-3 @md:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="sale-quantity" className="text-sm font-medium text-foreground">
            {t("quantity")}
          </label>
          <input
            id="sale-quantity"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={quantity}
            onChange={(e) => setQuantity(sanitizeDecimalInput(e.target.value))}
            className={inputClass}
          />
          <p className="text-xs text-muted">{t("available", { quantity: formatQuantity(position.quantity) })}</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="sale-price" className="text-sm font-medium text-foreground">
            {t("price", { currency })}
          </label>
          <input
            id="sale-price"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={priceText}
            onChange={(e) => setTypedPrice(sanitizeDecimalInput(e.target.value))}
            className={inputClass}
          />
          <p className="text-xs text-muted">
            {price === undefined
              ? t("noPrice")
              : suggestedPrice === null
                ? t("priceNotConvertible", { from: price.currency, to: currency })
                : t("priceFrom", { date: formatIsoDate(price.date) })}
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="sale-fees" className="text-sm font-medium text-foreground">
            {t("fees", { currency })}
          </label>
          <input
            id="sale-fees"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={fees}
            onChange={(e) => setFees(sanitizeDecimalInput(e.target.value))}
            placeholder="0"
            className={inputClass}
          />
        </div>
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
              <dd className={`text-lg font-semibold tabular-nums ${gainColor}`}>
                {simulation.gain > 0 ? "+" : ""}
                {formatCurrency(simulation.gain, currency)}
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
