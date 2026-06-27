"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { formatCurrency, formatNumber } from "@/core/format";
import type { Position } from "@/lib/portfolio";

type Props = {
  positions: Position[];
  /** Id de la posición que se está editando (resaltada), o null. */
  editingId: string | null;
  onEdit: (position: Position) => void;
  onDeleted: (id: string) => void;
};

/** Tabla de posiciones con editar y borrado inline (confirmación sin modal). */
export default function PositionList({ positions, editingId, onEdit, onDeleted }: Props) {
  const t = useTranslations("portfolio.list");
  // id en confirmación de borrado / id en proceso de borrado.
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/positions/${id}`, { method: "DELETE" });
      if (res.ok) {
        onDeleted(id);
      }
    } finally {
      setDeletingId(null);
      setConfirmingId(null);
    }
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
      <table className="w-full min-w-[40rem] text-left text-sm">
        <thead>
          <tr className="border-b border-border text-muted">
            <th scope="col" className="px-4 py-3 font-medium">
              {t("ticker")}
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              {t("name")}
            </th>
            <th scope="col" className="px-4 py-3 text-right font-medium">
              {t("quantity")}
            </th>
            <th scope="col" className="px-4 py-3 text-right font-medium">
              {t("avgPrice")}
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              {t("broker")}
            </th>
            <th scope="col" className="px-4 py-3 text-right font-medium">
              {t("value")}
            </th>
            <th scope="col" className="px-4 py-3 text-right font-medium">
              <span className="sr-only">{t("actions")}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {positions.map((p) => {
            const value = p.quantity * p.avgPrice;
            const isConfirming = confirmingId === p.id;
            const isDeleting = deletingId === p.id;
            const isEditing = editingId === p.id;
            return (
              <tr
                key={p.id}
                className={`border-b border-border last:border-0 ${
                  isEditing ? "bg-surface-2" : ""
                }`}
              >
                <td className="px-4 py-3 font-medium text-foreground">{p.ticker}</td>
                <td className="px-4 py-3 text-muted">{p.name ?? "—"}</td>
                <td className="px-4 py-3 text-right tabular-nums text-foreground">
                  {formatNumber(p.quantity)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-foreground">
                  {formatCurrency(p.avgPrice, p.currency)}
                </td>
                <td className="px-4 py-3 text-muted">{p.broker ?? "—"}</td>
                <td className="px-4 py-3 text-right tabular-nums text-foreground">
                  {formatCurrency(value, p.currency)}
                </td>
                <td className="px-4 py-3 text-right">
                  {isConfirming ? (
                    <span className="inline-flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleDelete(p.id)}
                        disabled={isDeleting}
                        className="rounded-md bg-warning px-2.5 py-1 text-xs font-medium text-brand-fg transition hover:opacity-90 disabled:opacity-50"
                      >
                        {isDeleting ? t("deleting") : t("confirm")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingId(null)}
                        disabled={isDeleting}
                        className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground transition hover:bg-surface-2 disabled:opacity-50"
                      >
                        {t("cancel")}
                      </button>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onEdit(p)}
                        className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted transition hover:bg-surface-2 hover:text-foreground"
                      >
                        {t("edit")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingId(p.id)}
                        className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted transition hover:bg-surface-2 hover:text-foreground"
                      >
                        {t("delete")}
                      </button>
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
