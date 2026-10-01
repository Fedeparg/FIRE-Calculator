"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { MAX_IMPORT_BYTES } from "@sextante/core/imports/limits";
import type { ImportPlan, ImportResult } from "@sextante/core/imports/types";
import { trackEvent } from "@/features/analytics/track";
import Notice from "@/shared/ui/Notice";
import { importErrorKey, type ImportErrorKey } from "@/features/portfolio/model/import-errors";
import { useFormat } from "@/lib/format";
import { apiJson } from "@/shared/api/client";
import { PlanView, ResultView } from "./TradeRepublicImportViews";

/** Slug del bróker para la analítica (sin datos del usuario). */
const BROKER_SLUG = "trade-republic";

/** Rutas de la API. El CSV viaja como `text/csv` (ver `read-text-body.ts` en la API). */
const PREVIEW_URL = "/api/imports/trade-republic/preview";
const CONFIRM_URL = "/api/imports/trade-republic/confirm";

type Step =
  | { kind: "idle" }
  | { kind: "analysing" }
  | { kind: "preview"; plan: ImportPlan }
  | { kind: "importing"; plan: ImportPlan }
  | { kind: "done"; result: ImportResult };

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground file:mr-3 file:rounded-md file:border-0 file:bg-surface-2 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-brand/30";

/**
 * Flujo de importación desde Trade Republic: elegir fichero → vista previa → confirmar →
 * resultado.
 *
 * El servidor NO guarda nada entre la vista previa y la confirmación (es stateless), así que
 * el `File` se conserva aquí y se vuelve a enviar al confirmar. La autorización y el aislamiento
 * entre usuarios los decide siempre la API; este componente solo orquesta y traduce.
 */
export default function TradeRepublicImport() {
  const t = useTranslations("portfolio.import");
  const { formatQuantity } = useFormat();
  const router = useRouter();
  const uid = useId();

  const [step, setStep] = useState<Step>({ kind: "idle" });
  const [file, setFile] = useState<File | null>(null);
  const [errorKey, setErrorKey] = useState<ImportErrorKey | null>(null);

  /** Envía el CSV a una ruta de la API. Devuelve el JSON o la clave del error a mostrar. */
  async function post<T>(url: string, csv: File): Promise<{ data: T } | { error: ImportErrorKey }> {
    try {
      return { data: await apiJson<T>(url, { method: "POST", headers: { "Content-Type": "text/csv" }, body: csv }) };
    } catch (error) {
      return { error: importErrorKey(error) };
    }
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0] ?? null;
    setErrorKey(null);
    setStep({ kind: "idle" });
    setFile(chosen);
    if (!chosen) return;

    // Se corta antes de subir lo que la API rechazaría de todos modos (413).
    if (chosen.size > MAX_IMPORT_BYTES) {
      setErrorKey("errorTooLarge");
      return;
    }

    setStep({ kind: "analysing" });
    const outcome = await post<ImportPlan>(PREVIEW_URL, chosen);
    if ("error" in outcome) {
      setErrorKey(outcome.error);
      setStep({ kind: "idle" });
      return;
    }
    setStep({ kind: "preview", plan: outcome.data });
  }

  async function handleConfirm() {
    if (step.kind !== "preview" || !file) return;
    const { plan } = step;
    setErrorKey(null);
    setStep({ kind: "importing", plan });

    const outcome = await post<ImportResult>(CONFIRM_URL, file);
    if ("error" in outcome) {
      setErrorKey(outcome.error);
      setStep({ kind: "preview", plan });
      return;
    }
    const result = outcome.data;
    setStep({ kind: "done", result });
    if (result.totals.lotsCreated > 0) {
      trackEvent({ name: "broker-import-completed", data: { broker: BROKER_SLUG } });
    }
    // Vuelve a pedir al servidor la cartera: al volver a /portfolio ya incluye lo importado.
    router.refresh();
  }

  const busy = step.kind === "analysing" || step.kind === "importing";

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby={`${uid}-howto`} className="rounded-2xl border border-border bg-surface p-6">
        <h2 id={`${uid}-howto`} className="text-lg font-semibold text-foreground">
          {t("howTo.title")}
        </h2>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-foreground">
          <li>{t("howTo.step1")}</li>
          <li>{t("howTo.step2")}</li>
          <li>{t("howTo.step3")}</li>
          <li>{t("howTo.step4")}</li>
        </ol>
        <p className="mt-3 text-sm text-muted">{t("howTo.fullHistory")}</p>
      </section>

      <section aria-labelledby={`${uid}-scope`} className="rounded-2xl border border-border bg-surface p-6">
        <h2 id={`${uid}-scope`} className="text-lg font-semibold text-foreground">
          {t("scope.title")}
        </h2>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-foreground">
          <li>{t("scope.included")}</li>
          <li>{t("scope.notYet")}</li>
          <li>{t("scope.derivatives")}</li>
          <li>{t("scope.migrations")}</li>
          <li>{t("scope.tax")}</li>
        </ul>
        <p className="mt-3 text-sm text-muted">{t("privacy")}</p>
      </section>

      <section className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-6">
        <label htmlFor={`${uid}-file`} className="text-sm font-medium text-foreground">
          {t("file.label")}
        </label>
        <input
          id={`${uid}-file`}
          type="file"
          accept=".csv,text/csv"
          disabled={busy}
          onChange={handleFileChange}
          aria-describedby={`${uid}-file-hint`}
          className={inputClass}
        />
        <p id={`${uid}-file-hint`} className="text-xs text-muted">
          {t("file.hint")}
        </p>
        {/* Región viva: los lectores de pantalla anuncian el progreso y los errores. */}
        <div role="status" aria-live="polite" className="text-sm text-muted">
          {step.kind === "analysing" && t("analysing")}
          {step.kind === "importing" && t("importing")}
        </div>
        {errorKey && (
          <p role="alert" className="text-sm text-warning">
            {t(errorKey)}
          </p>
        )}
      </section>

      {(step.kind === "preview" || step.kind === "importing") && (
        <PlanView
          plan={step.plan}
          importing={step.kind === "importing"}
          onConfirm={handleConfirm}
          formatQuantity={formatQuantity}
        />
      )}

      {step.kind === "done" && <ResultView result={step.result} formatQuantity={formatQuantity} />}

      <Notice variant="info">{t("disclaimer")}</Notice>
    </div>
  );
}
