"use client";

import { useTranslations } from "next-intl";

import { formatIsoDate } from "@/core/format";
import { useFormat } from "@/lib/format";
import type { PositionLot } from "@sextante/core/portfolio/types";

type Props = {
  lots: readonly PositionLot[];
  ticker: string;
  /** Los importes de un lote van siempre en la divisa de su posición. */
  currency: string;
  /** Lote que se está editando en el formulario (se resalta). */
  editingId: string | null;
  /** Lote pendiente de confirmar su borrado. */
  confirmingId: string | null;
  /** Hay una mutación en curso: se bloquean los botones de confirmación. */
  submitting: boolean;
  onEdit: (lot: PositionLot) => void;
  onAskDelete: (lotId: string) => void;
  onCancelDelete: () => void;
  onConfirmDelete: (lotId: string) => void;
};

/** Histórico de operaciones de una posición, con editar y borrar (con confirmación) por lote. */
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
            {confirmingId === lot.id ? (
              <span className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => onConfirmDelete(lot.id)}
                  disabled={submitting}
                  className="rounded-md bg-warning px-2.5 py-1.5 font-medium text-brand-fg disabled:opacity-50"
                >
                  {t("confirmDelete")}
                </button>
                <button
                  type="button"
                  onClick={onCancelDelete}
                  disabled={submitting}
                  className="rounded-md border border-border px-2.5 py-1.5 font-medium text-foreground disabled:opacity-50"
                >
                  {t("cancel")}
                </button>
              </span>
            ) : (
              <span className="flex shrink-0 gap-1">
                <button
                  type="button"
                  onClick={() => onEdit(lot)}
                  className="rounded-md px-2 py-1.5 font-medium hover:bg-surface-2 hover:text-foreground"
                >
                  {t("edit")}
                </button>
                <button
                  type="button"
                  onClick={() => onAskDelete(lot.id)}
                  className="rounded-md px-2 py-1.5 font-medium hover:bg-surface-2 hover:text-foreground"
                >
                  {t("delete")}
                </button>
              </span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
