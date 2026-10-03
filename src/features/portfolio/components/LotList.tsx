"use client";

import { useTranslations } from "next-intl";

import { formatIsoDate } from "@/shared/format/format";
import { useFormat } from "@/shared/format/use-format";
import type { PositionLot } from "@sextante/core/portfolio/types";
import RowActions from "@/shared/ui/RowActions";

type Props = {
  lots: readonly PositionLot[];
  ticker: string;
  /** A lot's amounts are always in its position's currency. */
  currency: string;
  /** Lot being edited in the form (highlighted). */
  editingId: string | null;
  /** Lot pending delete confirmation. */
  confirmingId: string | null;
  /** A mutation is in progress: the confirmation buttons are disabled. */
  submitting: boolean;
  onEdit: (lot: PositionLot) => void;
  onAskDelete: (lotId: string) => void;
  onCancelDelete: () => void;
  onConfirmDelete: (lotId: string) => void;
};

/** Trade history of a position, with edit and delete (with confirmation) per lot. */
export default function LotList({
  lots,
  ticker,
  currency,
  editingId,
  confirmingId,
  submitting,
  onEdit,
  onAskDelete,
  onCancelDelete,
  onConfirmDelete,
}: Props) {
  const t = useTranslations("portfolio.lots");
  const { formatCurrency, formatQuantity } = useFormat();

  if (lots.length === 0) return <p className="text-sm text-muted">{t("empty")}</p>;

  const rowLabels = (item: string) => ({
    edit: t("edit"),
    delete: t("delete"),
    confirm: t("confirmDelete"),
    cancel: t("cancel"),
    editLabel: t("editItem", { item }),
    deleteLabel: t("deleteItem", { item }),
    confirmLabel: t("confirmDeleteItem", { item }),
  });

  return (
    <ul aria-label={t("tableCaption", { ticker })} className="flex flex-col">
      {lots.map((lot) => (
        <li
          key={lot.id}
          className={`flex flex-col gap-1.5 border-b border-border py-3 last:border-0 ${
            editingId === lot.id ? "rounded-lg bg-surface-2 px-2" : ""
          }`}
        >
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span>
              <span className={`font-medium ${lot.kind === "buy" ? "text-success" : "text-danger"}`}>
                {lot.kind === "buy" ? t("kindBuy") : t("kindSell")}
              </span>
              <span className="text-muted"> · {formatIsoDate(lot.tradedAt)}</span>
            </span>
            <span className="text-right tabular-nums text-foreground">
              {formatQuantity(lot.quantity)} × {formatCurrency(lot.price, currency)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3 text-xs text-muted">
            <span className="min-w-0 truncate">
              {[lot.fees > 0 ? `${t("feesShort")}: ${formatCurrency(lot.fees, currency)}` : null, lot.note]
                .filter(Boolean)
                .join(" · ")}
            </span>
            <RowActions
              labels={rowLabels(
                `${lot.kind === "buy" ? t("kindBuy") : t("kindSell")} · ${formatIsoDate(lot.tradedAt)}`,
              )}
              confirming={confirmingId === lot.id}
              busy={submitting}
              onEdit={() => onEdit(lot)}
              onAskDelete={() => onAskDelete(lot.id)}
              onCancelDelete={onCancelDelete}
              onConfirmDelete={() => onConfirmDelete(lot.id)}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
