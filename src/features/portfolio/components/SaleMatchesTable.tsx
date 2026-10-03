"use client";

import { useTranslations } from "next-intl";

import type { MatchedLot } from "@sextante/core/fiscal/plusvalias";
import { formatIsoDate } from "@/shared/format/format";
import { signedTone } from "@/shared/format/signed-tone";
import { useFormat } from "@/shared/format/use-format";
import DataTable, { type DataTableColumn } from "@/shared/ui/DataTable";

type Props = {
  /** Purchase lots consumed by the sale, matched by FIFO. */
  matched: readonly MatchedLot[];
  /** Position currency: the lots are always in it. */
  currency: string;
};

/** FIFO breakdown of a sale: which lots each share comes from and how much is gained on each. */
export default function SaleMatchesTable({ matched, currency }: Props) {
  const t = useTranslations("portfolio.sale");
  const { formatCurrency, formatSignedCurrency, formatQuantity } = useFormat();
  const amount = "tabular-nums text-foreground";

  const columns: DataTableColumn<MatchedLot>[] = [
    {
      key: "date",
      header: t("lotDate"),
      rowHeader: true,
      cellClassName: "text-muted",
      cell: (match) => formatIsoDate(match.tradedAt),
    },
    {
      key: "quantity",
      header: t("lotQuantity"),
      align: "right",
      cellClassName: amount,
      cell: (m) => formatQuantity(m.quantity),
    },
    {
      key: "price",
      header: t("lotPrice"),
      align: "right",
      cellClassName: amount,
      cell: (m) => formatCurrency(m.price, currency),
    },
    {
      key: "acquisition",
      header: t("lotAcquisition"),
      align: "right",
      cellClassName: amount,
      cell: (m) => formatCurrency(m.acquisitionValue, currency),
    },
    {
      key: "gain",
      header: t("lotGain"),
      align: "right",
      cellClassName: (m) => `tabular-nums ${signedTone(m.gain)}`,
      cell: (m) => formatSignedCurrency(m.gain, currency),
    },
  ];

  return (
    <DataTable
      caption={t("fifoCaption")}
      captionVisible
      columns={columns}
      rows={matched}
      rowKey={(match) => match.lotId}
      minWidthClass="min-w-[34rem]"
    />
  );
}
