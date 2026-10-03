"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useTranslations } from "next-intl";

import { useMediaQuery } from "@/shared/ui/use-media-query";

/** A partir de `lg` (64rem) el panel es lateral; por debajo, una hoja modal. */
const DESKTOP_QUERY = "(min-width: 64rem)";

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
 * lista), Escape lo cierra y al cerrarse devuelve el foco a donde estaba (la fila o el botón que
 * lo abrió). No es `aria-modal`: en escritorio la lista sigue siendo usable a su lado, y marcarlo
 * modal escondería esa lista a los lectores de pantalla. En móvil, en cambio, la hoja tapa la
 * página: el resto se marca `inert` (ni foco ni lector de pantalla ni clics pueden llegar detrás)
 * y se bloquea el scroll del fondo mientras está abierta.
 */
export default function PositionPanel({ id, labelledBy, onClose, children }: Props) {
  const t = useTranslations("portfolio.panel");
  const panelRef = useRef<HTMLElement>(null);
  const scrimRef = useRef<HTMLButtonElement>(null);
  const isSheet = !useMediaQuery(DESKTOP_QUERY);

  // Solo al montar y desmontar: guarda quién tenía el foco, lo pasa al panel y lo devuelve al
  // cerrar. Va aparte del efecto de Escape para no repetirse cuando cambia `onClose`. Al cerrar,
  // React limpia los efectos en orden de declaración, así que este corre ANTES de que el efecto
  // de la hoja quite el `inert` del resto de la página, y el navegador no deja enfocar algo
  // inerte (el foco caería en `body`). Por eso se devuelve en una microtarea: para entonces todas
  // las limpiezas del desmontaje ya han corrido.
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current?.focus();
    return () => {
      queueMicrotask(() => {
        if (previous?.isConnected) previous.focus();
      });
    };
  }, []);

  // Hoja modal en móvil: `inert` en todo lo que no sea el panel (subiendo por sus ancestros hasta
  // `body`, para no tocar la cadena que lo contiene) y sin scroll detrás. El fondo oscurecido
  // queda fuera porque tocarlo cierra la hoja.
  useEffect(() => {
    const panel = panelRef.current;
    if (!isSheet || !panel) return;
    const inerted: Element[] = [];
    for (let node: HTMLElement = panel; node !== document.body && node.parentElement; node = node.parentElement) {
      for (const sibling of node.parentElement.children) {
        if (sibling !== node && sibling !== scrimRef.current && !sibling.hasAttribute("inert")) {
          // Atributo y no la propiedad `inert`: es lo mismo para el navegador, y el compilador
          // de React no admite asignar propiedades a valores que salen de una ref.
          sibling.setAttribute("inert", "");
          inerted.push(sibling);
        }
      }
    }
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      for (const element of inerted) element.removeAttribute("inert");
      document.body.style.overflow = overflow;
    };
  }, [isSheet]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // `defaultPrevented`: un control interno (el desplegable de búsqueda) ya consumió el Escape.
      if (event.key === "Escape" && !event.defaultPrevented) onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <>
      {/* Fondo de la hoja en móvil. Es un botón (no un div con onClick) para que sea una acción
          real; fuera del orden de tabulación y oculto a los lectores de pantalla porque el botón
          de cerrar ya cubre el teclado y la accesibilidad: aquí sería un control duplicado. */}
      <button
        ref={scrimRef}
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        onClick={onClose}
        className="fixed inset-0 z-30 bg-foreground/40 lg:hidden"
      />
      <section
        ref={panelRef}
        id={id}
        role="dialog"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className="@container fixed inset-x-0 bottom-0 z-40 flex max-h-[88vh] flex-col overflow-y-auto rounded-t-3xl border border-border bg-surface p-5 pt-3 shadow-xl outline-hidden lg:sticky lg:inset-auto lg:top-6 lg:z-auto lg:max-h-[calc(100vh-3rem)] lg:rounded-2xl lg:p-6 lg:shadow-md"
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
