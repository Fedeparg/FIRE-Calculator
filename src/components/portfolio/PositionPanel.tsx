"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useTranslations } from "next-intl";

type Props = {
  /** Id del panel (lo referencian las filas con `aria-controls`). */
  id: string;
  /** Id del título del contenido, que da nombre al panel. */
  labelledBy: string;
  onClose: () => void;
  children: ReactNode;
};

/**
 * Contenedor del detalle, el alta y la edición de una posición. Es el MISMO componente en dos
 * presentaciones, decididas solo con CSS:
 *
 * - Escritorio (`lg`): un panel lateral pegajoso junto a la lista, para ver la fila y su detalle
 *   a la vez.
 * - Móvil: una hoja que sube desde abajo sobre un fondo oscurecido; tocar el fondo la cierra.
 *
 * Al abrirse recibe el foco (para que teclado y lector de pantalla lleguen a él sin recorrer la
 * lista) y Escape lo cierra. No es `aria-modal`: en escritorio la lista sigue siendo usable a su
 * lado, y marcarlo modal escondería esa lista a los lectores de pantalla.
 */
export default function PositionPanel({ id, labelledBy, onClose, children }: Props) {
  const t = useTranslations("portfolio.panel");
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    panelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <>
      {/* Fondo de la hoja en móvil. Es un botón (no un div con onClick) para que sea una acción
          real; fuera del orden de tabulación porque el botón de cerrar ya cubre el teclado. */}
      <button
        type="button"
        tabIndex={-1}
        aria-label={t("close")}
        onClick={onClose}
        className="fixed inset-0 z-30 bg-foreground/40 lg:hidden"
      />
      <section
        ref={panelRef}
        id={id}
        role="dialog"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className="@container fixed inset-x-0 bottom-0 z-40 flex max-h-[88vh] flex-col overflow-y-auto rounded-t-3xl border border-border bg-surface p-5 pt-3 shadow-xl outline-none lg:sticky lg:inset-auto lg:top-6 lg:z-auto lg:max-h-[calc(100vh-3rem)] lg:rounded-2xl lg:p-6 lg:shadow-md"
      >
        <span aria-hidden="true" className="mx-auto mb-3 h-1.5 w-10 shrink-0 rounded-full bg-border lg:hidden" />
        <button
          type="button"
          onClick={onClose}
          aria-label={t("close")}
          className="absolute right-4 top-4 grid h-11 w-11 place-items-center rounded-xl border border-border text-muted transition hover:bg-surface-2 hover:text-foreground lg:h-9 lg:w-9"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
        {children}
      </section>
    </>
  );
}
