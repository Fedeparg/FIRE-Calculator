"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { deletePosition } from "@/shared/api/portfolio-api";

type Props = {
  positionId: string;
  /**
   * Borrar una posición con ventas las quita del informe de plusvalías: merece un aviso más
   * fuerte que el "¿seguro?" normal.
   */
  hasSales: boolean;
  /** Abrir el formulario de edición de la posición. */
  onEdit: () => void;
  /** La posición se ha borrado. */
  onDeleted: (id: string) => void;
};

/** Pie del detalle: editar la posición o eliminarla (con confirmación). */
export default function PositionDeleteBar({ positionId, hasSales, onEdit, onDeleted }: Props) {
  const tDetail = useTranslations("portfolio.detail");
  const tList = useTranslations("portfolio.list");
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [failed, setFailed] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    setFailed(false);
    try {
      await deletePosition(positionId);
      onDeleted(positionId);
    } catch {
      setFailed(true);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="mt-auto flex flex-col gap-2 border-t border-border pt-4">
      {confirming ? (
        <>
          {hasSales && (
            <p role="alert" className="text-xs text-warning">
              {tList("confirmDeleteWithSales")}
            </p>
          )}
          {failed && (
            <p role="alert" className="text-xs text-warning">
              {tDetail("deleteError")}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void handleDelete()}
              disabled={deleting}
              className="h-11 flex-1 rounded-lg bg-warning px-3 text-sm font-medium text-brand-fg disabled:opacity-50"
            >
              {deleting ? tList("deleting") : tList("confirm")}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={deleting}
              className="h-11 flex-1 rounded-lg border border-border px-3 text-sm font-medium text-foreground disabled:opacity-50"
            >
              {tList("cancel")}
            </button>
          </div>
        </>
      ) : (
        <div className="flex justify-between">
          <button
            type="button"
            onClick={onEdit}
            className="h-11 rounded-lg px-3 text-sm font-medium text-foreground hover:bg-surface-2"
          >
            {tDetail("editPosition")}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="h-11 rounded-lg px-3 text-sm font-medium text-danger hover:bg-danger-soft"
          >
            {tDetail("deletePosition")}
          </button>
        </div>
      )}
    </div>
  );
}
