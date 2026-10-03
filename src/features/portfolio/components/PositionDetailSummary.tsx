"use client";

import { useTranslations } from "next-intl";

import { formatIsoDate } from "@/shared/format/format";
import { dailyGain, valuePosition } from "@sextante/core/portfolio/positions";
import { signedTone } from "@/shared/format/signed-tone";
import { useFormat } from "@/shared/format/use-format";
import type { Position, PriceInfo } from "@sextante/core/portfolio/types";
import DerivativesNotice from "./DerivativesNotice";

/** Title id: names the panel that contains the detail. */
export const POSITION_DETAIL_TITLE_ID = "position-detail-title";

type Props = {
  position: Position;
  /** Last known price of the instrument. */
  price: PriceInfo | undefined;
  rates: Record<string, number>;
  /** The price is still being fetched (recently created). */
  pricePending: boolean;
};

/** Detail header: the position's name, value and gain, and its key data. */
export default function PositionDetailSummary({ position, price, rates, pricePending }: Props) {
  const tDetail = useTranslations("portfolio.detail");
  const tList = useTranslations("portfolio.list");
  const { formatCurrency, formatSignedCurrency, formatSignedPercent, formatQuantity } = useFormat();

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
          <span className={`text-sm tabular-nums ${signedTone(valuation.pnlAbs, "text-muted")}`}>
            {formatSignedCurrency(valuation.pnlAbs, position.currency)}
            {valuation.pnlPct !== null && (
              <>
                {" · "}
                {formatSignedPercent(valuation.pnlPct, { minDecimals: 2 })}
              </>
            )}
          </span>
          {/* Today's gain, separate from the total: without a previous close it is not shown. */}
          {today !== null && (
            <span className={`text-xs tabular-nums ${signedTone(today.abs, "text-muted")}`}>
              {tDetail("todayGain")}: {formatSignedCurrency(today.abs, position.currency)}
              {" · "}
              {formatSignedPercent(today.pct, { minDecimals: 2 })}
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
