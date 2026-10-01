"use client";

import { useTranslations } from "next-intl";

import { formatIsoDate } from "@/core/format";
import { dailyGain, valuePosition } from "@sextante/core/portfolio/positions";
import { useFormat } from "@/lib/format";
import type { Position, PriceInfo } from "@sextante/core/portfolio/types";
import DerivativesNotice from "./DerivativesNotice";

/** Id del título: da nombre al panel que contiene el detalle. */
export const POSITION_DETAIL_TITLE_ID = "position-detail-title";

type Props = {
  position: Position;
  /** Último precio conocido del instrumento. */
  price: PriceInfo | undefined;
  rates: Record<string, number>;
  /** El precio aún se está buscando (alta reciente). */
  pricePending: boolean;
};

/** Color de una ganancia o pérdida; gris si no hay cifra o es cero. */
function gainClass(value: number | null | undefined): string {
  return value === null || value === undefined || value === 0
    ? "text-muted"
    : value > 0
      ? "text-success"
      : "text-danger";
}

/** Cabecera del detalle: nombre, valor y ganancia de la posición, y sus datos clave. */
export default function PositionDetailSummary({ position, price, rates, pricePending }: Props) {
  const tDetail = useTranslations("portfolio.detail");
  const tList = useTranslations("portfolio.list");
  const { formatCurrency, formatPercent, formatQuantity } = useFormat();

  const valuation = valuePosition(position, price, rates);
  const today = dailyGain(position, price, rates);

  return (
    <>
      <div className="flex flex-col gap-1 pr-14 lg:pr-12">
        <h2 id={POSITION_DETAIL_TITLE_ID} className="text-lg font-semibold text-foreground">
          {position.name ?? position.ticker}
        </h2>
        <p className="text-xs text-muted">{[position.ticker, position.broker].filter(Boolean).join(" · ")}</p>
      </div>

      {position.isDerivative ? (
        <DerivativesNotice />
      ) : valuation.marketValue !== null && valuation.pnlAbs !== null ? (
        <div className="flex flex-col gap-0.5">
          <span className="text-3xl font-semibold tracking-tight text-foreground tabular-nums">
            {formatCurrency(valuation.marketValue, position.currency)}
          </span>
          <span className={`text-sm tabular-nums ${gainClass(valuation.pnlAbs)}`}>
            {valuation.pnlAbs > 0 ? "+" : ""}
            {formatCurrency(valuation.pnlAbs, position.currency)}
            {valuation.pnlPct !== null && (
              <>
                {" · "}
                {valuation.pnlPct > 0 ? "+" : ""}
                {formatPercent(valuation.pnlPct, { minDecimals: 2 })}
              </>
            )}
          </span>
          {/* La ganancia de hoy, aparte de la total: sin cierre anterior no se enseña. */}
          {today !== null && (
            <span className={`text-xs tabular-nums ${gainClass(today.abs)}`}>
              {tDetail("todayGain")}: {today.abs > 0 ? "+" : ""}
              {formatCurrency(today.abs, position.currency)}
              {" · "}
              {today.pct > 0 ? "+" : ""}
              {formatPercent(today.pct, { minDecimals: 2 })}
            </span>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted">{pricePending ? tList("pricePendingHint") : tList("noPrice")}</p>
      )}

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl bg-surface-2 p-4 text-sm">
        <div>
          <dt className="text-muted">{tList("quantity")}</dt>
          <dd className="font-medium text-foreground tabular-nums">{formatQuantity(position.quantity)}</dd>
        </div>
        <div>
          <dt className="text-muted">{tList("avgPrice")}</dt>
          <dd className="font-medium text-foreground tabular-nums">
            {formatCurrency(position.avgPrice, position.currency)}
          </dd>
        </div>
        <div>
          <dt className="text-muted">{tList("invested")}</dt>
          <dd className="font-medium text-foreground tabular-nums">
            {formatCurrency(valuation.invested, position.currency)}
          </dd>
        </div>
        {price && (
          <div>
            <dt className="text-muted">{tDetail("priceOn", { date: formatIsoDate(price.date) })}</dt>
            <dd className="font-medium text-foreground tabular-nums">{formatCurrency(price.close, price.currency)}</dd>
          </div>
        )}
      </dl>
    </>
  );
}
