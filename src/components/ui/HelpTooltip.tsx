"use client";

import { useEffect, useId, useRef, useState, type FocusEvent, type PointerEvent } from "react";
import { useTranslations } from "next-intl";

/**
 * Botón "?" reutilizable con un popover explicativo.
 *
 * Decisiones de accesibilidad:
 * - El nombre accesible del botón es corto y traducido ("Más información"). Usar
 *   el texto completo como `aria-label` obligaba a escuchar el párrafo entero
 *   solo para saber qué es el control.
 * - El texto largo se expone como DESCRIPCIÓN vía `aria-describedby`, que es la
 *   forma en que un lector de pantalla anuncia una ayuda contextual.
 * - El contenido está SIEMPRE en el DOM (oculto con `sr-only` cuando está
 *   cerrado) para que `aria-describedby` resuelva siempre a un nodo existente:
 *   una referencia a un nodo desmontado se ignora y la descripción se pierde.
 * - Se abre también con click/toque: en móvil no hay hover, así que antes el
 *   texto era sencillamente inalcanzable.
 * - Se cierra con `Escape`, al perder el foco y al pulsar fuera.
 */
export default function HelpTooltip({ text }: { text: string }) {
  const t = useTranslations("common");
  const tooltipId = useId();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    // Pulsar fuera cierra: en táctil el `blur` del botón no es fiable.
    function handlePointerDown(event: globalThis.PointerEvent) {
      const target = event.target;
      if (target instanceof Node && containerRef.current?.contains(target)) return;
      setOpen(false);
    }

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [open]);

  // Solo el puntero de ratón abre por hover: en táctil el navegador emula
  // `pointerenter` justo antes del click, y el toggle del click lo cerraría.
  function handlePointerEnter(event: PointerEvent<HTMLSpanElement>) {
    if (event.pointerType === "mouse") setOpen(true);
  }
  function handlePointerLeave(event: PointerEvent<HTMLSpanElement>) {
    if (event.pointerType === "mouse") setOpen(false);
  }

  // Solo el foco por teclado abre. Con ratón o toque el foco llega junto al
  // click, que ya gobierna la apertura.
  function handleFocus(event: FocusEvent<HTMLButtonElement>) {
    if (event.target.matches(":focus-visible")) setOpen(true);
  }

  return (
    <span
      ref={containerRef}
      className="relative inline-flex"
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
    >
      <button
        type="button"
        aria-label={t("moreInfo")}
        aria-describedby={tooltipId}
        onClick={() => setOpen((prev) => !prev)}
        onFocus={handleFocus}
        onBlur={() => setOpen(false)}
        className="grid h-4 w-4 cursor-pointer place-items-center rounded-full border border-border text-[10px] font-bold leading-none text-muted transition-colors hover:border-brand hover:text-brand focus-visible:border-brand focus-visible:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
      >
        ?
      </button>
      <span
        id={tooltipId}
        role="tooltip"
        className={
          open
            ? "absolute left-1/2 top-6 z-20 w-56 -translate-x-1/2 rounded-lg border border-border bg-surface p-2.5 text-xs font-normal leading-relaxed text-foreground shadow-lg"
            : "sr-only"
        }
      >
        {text}
      </span>
    </span>
  );
}
