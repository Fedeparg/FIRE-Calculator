"use client";

import { useTranslations } from "next-intl";

import type { MatchedLot } from "@sextante/core/fiscal/plusvalias";
import { formatIsoDate } from "@/shared/format/format";
import { signedTone } from "@/shared/format/signed-tone";
import { useFormat } from "@/shared/format/use-format";

type Props = {
  /** Lotes de compra que consume la venta, emparejados por FIFO. */
  matched: readonly MatchedLot[];
  /** Divisa de la posición: los lotes van siempre en ella. */
  currency: string;
};

/** Desglose FIFO de una venta: de qué lotes sale cada participación y cuánto se gana con cada uno. */
export default function SaleMatchesTable({ matched, currency }: Props) {
  const t = useTranslations("portfolio.sale");
  const { formatCurrency, formatSignedCurrency, formatQuantity } = useFormat();

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[34rem] text-left text-sm">
        <caption className="px-3 pt-3 text-left text-xs text-muted">{t("fifoCaption")}</caption>
        <thead>
          <tr className="border-b border-border text-muted">
            <th scope="col" className="px-3 py-2 font-medium">
              {t("lotDate")}
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              {t("lotQuantity")}
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              {t("lotPrice")}
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              {t("lotAcquisition")}
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              {t("lotGain")}
            </th>
          </tr>
        </thead>
        <tbody>
          {matched.map((match) => (
            <tr key={match.lotId} className="border-b border-border last:border-0">
              <th scope="row" className="px-3 py-2 font-normal text-muted">
                {formatIsoDate(match.tradedAt)}
              </th>
              <td className="px-3 py-2 text-right tabular-nums text-foreground">{formatQuantity(match.quantity)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-foreground">
                {formatCurrency(match.price, currency)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-foreground">
                {formatCurrency(match.acquisitionValue, currency)}
              </td>
              <td className={`px-3 py-2 text-right tabular-nums ${signedTone(match.gain)}`}>
                {formatSignedCurrency(match.gain, currency)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
