"use client";

import { useState } from "react";

/**
 * Botón "?" reutilizable con un popover explicativo que aparece al pasar el ratón
 * por encima (y al enfocar con teclado, por accesibilidad).
 */
export default function HelpTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={text}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="grid h-4 w-4 cursor-help place-items-center rounded-full border border-border text-[10px] font-bold leading-none text-muted transition-colors hover:border-brand hover:text-brand"
      >
        ?
      </button>
      {open && (
        <span
          role="tooltip"
          className="pointer-events-none absolute left-1/2 top-6 z-20 w-56 -translate-x-1/2 rounded-lg border border-border bg-surface p-2.5 text-xs font-normal leading-relaxed text-foreground shadow-lg"
        >
          {text}
        </span>
      )}
    </span>
  );
}
