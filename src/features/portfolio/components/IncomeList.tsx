"use client";

import { useTranslations } from "next-intl";

import type { IncomeEvent } from "@sextante/core/fiscal/income";
import { formatIsoDate } from "@/shared/format/format";
import { useFormat } from "@/shared/format/use-format";
import Button from "@/shared/ui/Button";

type Props = {
  income: readonly IncomeEvent[];
  /** Cobro que se está editando (se resalta). */
  editingId: string | null;
  /** Cobro pendiente de confirmar su borrado. */
  confirmingId: string | null;
  submitting: boolean;
  onEdit: (event: IncomeEvent) => void;
  onAskDelete: (id: string) => void;
  onCancelDelete: () => void;
  onConfirmDelete: (id: string) => void;
};

/** Cobros con su íntegro y retenciones, en su divisa; editar y borrar (con confirmación). */
export default function IncomeList({
  income,
  editingId,
  confirmingId,
  submitting,
  onEdit,
  onAskDelete,
  onCancelDelete,
  onConfirmDelete,
}: Props) {
  const t = useTranslations("portfolio.income");
  const { formatCurrency } = useFormat();

  if (income.length === 0) return <p className="text-sm text-muted">{t("empty")}</p>;

  return (
    <ul aria-label={t("listLabel")} className="flex flex-col">
      {income.map((event) => (
        <li
          key={event.id}
          className={`flex flex-col gap-1.5 border-b border-border py-3 last:border-0 ${
            editingId === event.id ? "rounded-lg bg-surface-2 px-2" : ""
          }`}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm">
            <span>
              <span className="font-medium text-foreground">{t(`kinds.${event.kind}`)}</span>
              <span className="text-muted">
                {" · "}
                {formatIsoDate(event.paidAt)}
                {event.name && ` · ${event.name}`}
              </span>
            </span>
            <span className="tabular-nums font-medium text-foreground">
              {formatCurrency(event.gross, event.currency)}
            </span>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            <span>
              {t("withholdingOriginShort")}:{" "}
              {event.withholdingOrigin === null ? (
                <span className="text-warning">{t("unknown")}</span>
              ) : (
                formatCurrency(event.withholdingOrigin, event.currency)
              )}
            </span>
            <span>
              {t("withholdingSpainShort")}: {formatCurrency(event.withholdingSpain, event.currency)}
            </span>
            {event.country && <span>{event.country}</span>}
            {event.reportedToAeat && <span className="text-success">{t("reportedBadge")}</span>}
          </div>
          <div className="flex justify-end text-xs text-muted">
            {confirmingId === event.id ? (
              <span className="flex shrink-0 gap-2">
                <Button variant="warning" size="xs" onClick={() => onConfirmDelete(event.id)} disabled={submitting}>
                  {t("confirmDelete")}
                </Button>
                <Button variant="secondary" size="xs" onClick={onCancelDelete} disabled={submitting}>
                  {t("cancel")}
                </Button>
              </span>
            ) : (
              <span className="flex shrink-0 gap-1">
                <button
                  type="button"
                  onClick={() => onEdit(event)}
                  className="rounded-md px-2 py-1.5 font-medium hover:bg-surface-2 hover:text-foreground"
                >
                  {t("edit")}
                </button>
                <button
                  type="button"
                  onClick={() => onAskDelete(event.id)}
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
