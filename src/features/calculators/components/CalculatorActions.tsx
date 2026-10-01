"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { trackEvent } from "@/shared/analytics/track";
import { useCalculatorState } from "./CalculatorState";
import ScenarioPanel from "./ScenarioPanel";
import Button from "@/shared/ui/Button";

/** Resultado del último intento de copiar (el portapapeles puede estar denegado). */
type CopyStatus = "idle" | "copied" | "error";

/** Cuánto se mantiene visible la confirmación de copiado. */
const COPY_FEEDBACK_MS = 3000;

/**
 * Barra de acciones bajo la calculadora: copiar el enlace del cálculo y (con sesión) los
 * escenarios guardados en la cuenta.
 *
 * La monta `CalculatorStateProvider`, así que aparece sola en cualquier calculadora que
 * declare sus campos con `useNumberField`/`useOptionField`; las que no declaran ninguno
 * (las de entrada no escalar) no tienen nada que compartir y no la muestran.
 */
export default function CalculatorActions() {
  const t = useTranslations("calculator.share");
  const state = useCalculatorState();
  const [copyStatus, setCopyStatus] = useState<CopyStatus>("idle");

  // La confirmación se borra sola: si se quedase fija, dejaría de leerse como respuesta a
  // la última pulsación.
  useEffect(() => {
    if (copyStatus === "idle") return;
    const timer = setTimeout(() => setCopyStatus("idle"), COPY_FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [copyStatus]);

  if (!state?.hasFields) return null;

  async function handleCopy() {
    if (!state) return;
    // `flushUrl` escribe la URL sin esperar al retardo: así se copia el estado actual y no
    // el de hace un cuarto de segundo.
    const href = state.flushUrl();
    try {
      await navigator.clipboard.writeText(href);
      setCopyStatus("copied");
      trackEvent({ name: "share-link-copied", data: { calculator: state.slug } });
    } catch {
      // El portapapeles puede estar bloqueado (permiso denegado, contexto no seguro).
      setCopyStatus("error");
    }
  }

  return (
    <section className="mt-6 grid gap-4 rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="mr-auto text-sm font-semibold text-foreground">{t("title")}</h2>
        <Button variant="accent" size="sm" onClick={handleCopy}>
          {t("copyLink")}
        </Button>
        {/*
          Región viva: el cambio de estado del botón se ANUNCIA, no solo se colorea. Está
          siempre en el DOM (no se crea al copiar) para que el lector de pantalla la observe.
        */}
        <p
          role="status"
          aria-live="polite"
          className={`text-sm ${copyStatus === "error" ? "text-warning" : "text-accent"}`}
        >
          {copyStatus === "copied" ? t("copied") : copyStatus === "error" ? t("copyError") : ""}
        </p>
      </div>

      <p className="text-xs text-muted">{t("hint")}</p>

      <ScenarioPanel />
    </section>
  );
}
