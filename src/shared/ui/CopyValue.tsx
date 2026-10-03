"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

type Props = {
  /** Texto que se copia, tal y como se escribe en el formulario de destino (p. ej. "1234,56"). */
  value: string;
  /** Qué se copia, para el lector de pantalla (p. ej. "casilla 0328"). */
  label: string;
};

/**
 * Botón pequeño que copia un valor al portapapeles y confirma durante un momento. Si el navegador
 * no deja copiar, muestra el valor para copiarlo a mano.
 */
export default function CopyValue({ value, label }: Props) {
  const t = useTranslations("common");
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
      setTimeout(() => setState("idle"), 1500);
    } catch {
      setState("failed");
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      aria-label={t("copyLabel", { label })}
      className="rounded-md px-1.5 py-0.5 text-xs font-medium text-muted transition hover:bg-surface-2 hover:text-foreground print:hidden"
    >
      {state === "copied" ? t("copied") : state === "failed" ? value : t("copy")}
    </button>
  );
}
