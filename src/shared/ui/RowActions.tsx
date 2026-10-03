"use client";

import { useEffect, useRef } from "react";

import Button from "@/shared/ui/Button";

/** Textos de las acciones. Los `*Label` son el nombre accesible, con el elemento de la fila. */
export type RowActionsLabels = {
  edit: string;
  delete: string;
  confirm: string;
  cancel: string;
  /** p. ej. "Editar Compra · 01/03/2025": el lector de pantalla sabe QUÉ fila se edita. */
  editLabel: string;
  deleteLabel: string;
  confirmLabel: string;
};

type Props = {
  labels: RowActionsLabels;
  /** La fila está pidiendo confirmación de borrado. */
  confirming: boolean;
  /** Hay una mutación en curso: se bloquean los botones de confirmación. */
  busy: boolean;
  onEdit: () => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
};

const linkButton = "rounded-md px-2 py-1.5 font-medium hover:bg-surface-2 hover:text-foreground";

/**
 * Editar y borrar (con confirmación) de una fila de una lista.
 *
 * Accesibilidad: cada botón lleva el nombre de su fila (sin él, una lista de lotes sonaría
 * "Editar, Editar, Editar"). Al pedir el borrado, el foco pasa al botón de confirmar; al
 * cancelar, vuelve al de borrar. Sin esto el foco caería en `<body>`, porque el botón pulsado
 * desaparece del DOM al cambiar de modo, y quien navega con teclado perdería su sitio.
 */
export default function RowActions({
  labels,
  confirming,
  busy,
  onEdit,
  onAskDelete,
  onCancelDelete,
  onConfirmDelete,
}: Props) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const deleteRef = useRef<HTMLButtonElement>(null);
  // Solo se devuelve el foco tras CANCELAR (no al montar la fila ni tras un borrado fallido).
  const returnFocus = useRef(false);

  // Efecto y no código en el manejador: el botón de destino aún no existe cuando se pulsa, solo
  // tras el render que cambia de modo.
  useEffect(() => {
    if (confirming) {
      confirmRef.current?.focus();
    } else if (returnFocus.current) {
      returnFocus.current = false;
      deleteRef.current?.focus();
    }
  }, [confirming]);

  if (confirming) {
    return (
      <span className="flex shrink-0 gap-2">
        <Button
          ref={confirmRef}
          variant="warning"
          size="xs"
          onClick={onConfirmDelete}
          disabled={busy}
          aria-label={labels.confirmLabel}
        >
          {labels.confirm}
        </Button>
        <Button
          variant="secondary"
          size="xs"
          onClick={() => {
            returnFocus.current = true;
            onCancelDelete();
          }}
          disabled={busy}
        >
          {labels.cancel}
        </Button>
      </span>
    );
  }

  return (
    <span className="flex shrink-0 gap-1">
      <button type="button" onClick={onEdit} aria-label={labels.editLabel} className={linkButton}>
        {labels.edit}
      </button>
      <button
        type="button"
        ref={deleteRef}
        onClick={onAskDelete}
        aria-label={labels.deleteLabel}
        className={linkButton}
      >
        {labels.delete}
      </button>
    </span>
  );
}
