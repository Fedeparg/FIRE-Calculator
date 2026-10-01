"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { MAX_IMPORT_BYTES } from "@sextante/core/imports/limits";
import type { ImportPlan, ImportResult } from "@sextante/core/imports/types";
import { trackEvent } from "@/components/analytics/track";
import Notice from "@/components/ui/Notice";
import DerivativesNotice from "./DerivativesNotice";
import { Link } from "@/i18n/navigation";
import { useFormat } from "@/lib/format";

/** Slug del bróker para la analítica (sin datos del usuario). */
const BROKER_SLUG = "trade-republic";

/** Rutas de la API. El CSV viaja como `text/csv` (ver `read-text-body.ts` en la API). */
const PREVIEW_URL = "/api/imports/trade-republic/preview";
const CONFIRM_URL = "/api/imports/trade-republic/confirm";

/** Códigos de error de la API que tienen mensaje propio. */
const API_ERROR_CODES = ["NOT_TRADE_REPUBLIC", "EMPTY_FILE", "MALFORMED_CSV", "TOO_MANY_ROWS"] as const;
type ApiErrorCode = (typeof API_ERROR_CODES)[number];

type ErrorKey =
  | "errorTooLarge"
  | "errorSession"
  | "errorRateLimit"
  | "errorNetwork"
  | "errorServer"
  | "errorGeneric"
  | "errorNotTradeRepublic"
  | "errorEmpty"
  | "errorMalformed"
  | "errorTooManyRows";

const ERROR_KEY_BY_API_CODE: Record<ApiErrorCode, ErrorKey> = {
  NOT_TRADE_REPUBLIC: "errorNotTradeRepublic",
  EMPTY_FILE: "errorEmpty",
  MALFORMED_CSV: "errorMalformed",
  TOO_MANY_ROWS: "errorTooManyRows",
};

function isApiErrorCode(code: unknown): code is ApiErrorCode {
  return API_ERROR_CODES.includes(code as ApiErrorCode);
}

/** Mensaje de error según la respuesta: el código de la API manda sobre el status. */
async function errorKeyOf(res: Response): Promise<ErrorKey> {
  if (res.status === 400) {
    try {
      const body = (await res.json()) as { code?: unknown };
      if (isApiErrorCode(body.code)) return ERROR_KEY_BY_API_CODE[body.code];
    } catch {
      // Cuerpo no JSON: se cae al mensaje genérico.
    }
    return "errorGeneric";
  }
  if (res.status === 401) return "errorSession";
  if (res.status === 413) return "errorTooLarge";
  if (res.status === 429) return "errorRateLimit";
  if (res.status >= 500) return "errorServer";
  return "errorGeneric";
}

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
  const [errorKey, setErrorKey] = useState<ErrorKey | null>(null);

  /** Envía el CSV a una ruta de la API. Devuelve el JSON o la clave del error a mostrar. */
  async function post<T>(url: string, csv: File): Promise<{ data: T } | { error: ErrorKey }> {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "text/csv" },
        body: csv,
      });
      if (!res.ok) return { error: await errorKeyOf(res) };
      return { data: (await res.json()) as T };
    } catch {
      // La promesa de fetch solo rechaza por fallo de red/conexión.
      return { error: "errorNetwork" };
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

type FormatQuantity = (n: number) => string;

function SkippedList({ plan }: { plan: ImportPlan | ImportResult }) {
  const t = useTranslations("portfolio.import");
  const tReason = useTranslations("portfolio.import.skipReasons");
  if (plan.skipped.length === 0) return null;
  return (
    <div>
      <h3 className="text-sm font-semibold text-foreground">{t("skipped.title")}</h3>
      <ul className="mt-2 space-y-1 text-sm text-muted">
        {plan.skipped.map(({ reason, count }) => (
          <li key={reason}>{t("skipped.item", { reason: tReason(reason), count })}</li>
        ))}
      </ul>
    </div>
  );
}

function WarningsList({ plan }: { plan: ImportPlan | ImportResult }) {
  const t = useTranslations("portfolio.import.warnings");
  const unbalanced = plan.warnings.filter((w) => w.code === "unbalanced_migration").length;
  const tax = plan.warnings.find((w) => w.code === "trade_tax_ignored");
  if (unbalanced === 0 && !tax) return null;
  return (
    <ul className="flex flex-col gap-2">
      {tax && tax.code === "trade_tax_ignored" && (
        <li>
          <Notice>{t("tradeTax", { count: tax.count })}</Notice>
        </li>
      )}
      {unbalanced > 0 && (
        <li>
          <Notice>{t("unbalancedMigration", { count: unbalanced })}</Notice>
        </li>
      )}
    </ul>
  );
}

function PlanView({
  plan,
  importing,
  onConfirm,
  formatQuantity,
}: {
  plan: ImportPlan;
  importing: boolean;
  onConfirm: () => void;
  formatQuantity: FormatQuantity;
}) {
  const t = useTranslations("portfolio.import.preview");
  const { formatCurrency } = useFormat();
  const created = plan.positions.filter((p) => p.action === "create" && !p.blockedBy).length;
  const extended = plan.positions.filter((p) => p.action === "extend" && !p.blockedBy).length;
  const importable = plan.positions.filter((p) => !p.blockedBy && p.newBuys + p.newSells > 0);
  const lotsToImport = importable.reduce((sum, p) => sum + p.newBuys + p.newSells, 0);

  return (
    <section
      aria-labelledby="import-preview-title"
      className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-6"
    >
      <h2 id="import-preview-title" className="text-lg font-semibold text-foreground">
        {t("title")}
      </h2>

      {plan.positions.length === 0 ? (
        <p className="text-sm text-muted">{t("nothingToImport")}</p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label={t("statCreated")} value={created} />
            <Stat label={t("statExtended")} value={extended} />
            <Stat label={t("statNewLots")} value={plan.totals.newLots} />
            <Stat label={t("statDuplicates")} value={plan.totals.duplicates} />
          </dl>

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <caption className="px-3 pt-3 text-left text-xs text-muted">{t("tableCaption")}</caption>
              <thead>
                <tr className="border-b border-border text-muted">
                  <th scope="col" className="px-3 py-2 font-medium">
                    {t("colInstrument")}
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    {t("colAction")}
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    {t("colBuys")}
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    {t("colSells")}
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    {t("colDuplicates")}
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    {t("colResulting")}
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    {t("colAvgPrice")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {plan.positions.map((p) => (
                  <tr key={p.isin} className="border-b border-border align-top last:border-0">
                    <th scope="row" className="px-3 py-2 font-normal">
                      <span className="block text-foreground">{p.name || p.isin}</span>
                      <span className="block text-xs text-muted">{p.isin}</span>
                      {p.blockedBy && (
                        <span className="mt-1 block text-xs text-warning">{t(`blocked.${p.blockedBy}`)}</span>
                      )}
                      {p.isDerivative && <span className="mt-1 block text-xs text-muted">{t("derivativeTag")}</span>}
                    </th>
                    <td className="px-3 py-2 text-foreground">{t(`action.${p.action}`)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-foreground">{p.newBuys}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-foreground">{p.newSells}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted">{p.duplicates}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-foreground">
                      {p.resultingQuantity === null
                        ? "—"
                        : p.resultingQuantity === 0
                          ? t("closed")
                          : formatQuantity(p.resultingQuantity)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-foreground">
                      {/* El importador solo admite operaciones en EUR (ver el parser). */}
                      {p.resultingAvgPrice === null ? "—" : formatCurrency(p.resultingAvgPrice, "EUR")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted">{t("avgPriceNote")}</p>
        </>
      )}

      {plan.positions.some((p) => p.isDerivative) && <DerivativesNotice />}
      <WarningsList plan={plan} />
      <SkippedList plan={plan} />

      {lotsToImport > 0 ? (
        <div>
          <button
            type="button"
            onClick={onConfirm}
            disabled={importing}
            className="rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-brand-fg transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {importing ? t("confirming") : t("confirm", { count: lotsToImport })}
          </button>
        </div>
      ) : (
        plan.positions.length > 0 && <p className="text-sm text-muted">{t("alreadyImported")}</p>
      )}
    </section>
  );
}

function ResultView({ result, formatQuantity }: { result: ImportResult; formatQuantity: FormatQuantity }) {
  const t = useTranslations("portfolio.import.result");
  return (
    <section
      aria-labelledby="import-result-title"
      className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-6"
    >
      <h2 id="import-result-title" className="text-lg font-semibold text-foreground">
        {t("title")}
      </h2>
      <p className="text-sm text-foreground">
        {t("summary", { count: result.totals.lotsCreated, duplicates: result.totals.duplicates })}
      </p>
      {result.totals.failedPositions > 0 && (
        <Notice>{t("failedNote", { count: result.totals.failedPositions })}</Notice>
      )}

      <ul className="divide-y divide-border rounded-lg border border-border text-sm">
        {result.positions.map((p) => (
          <li key={p.isin} className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2">
            <span>
              <span className="block text-foreground">{p.name || p.isin}</span>
              <span className="block text-xs text-muted">{p.isin}</span>
              {p.failure && <span className="block text-xs text-warning">{t(`failure.${p.failure}`)}</span>}
            </span>
            <span className="text-right text-muted">
              {t(`status.${p.status}`)}
              {p.quantity !== null && ` · ${formatQuantity(p.quantity)}`}
            </span>
          </li>
        ))}
      </ul>

      <p className="text-sm text-muted">{t("pricesNote")}</p>
      <WarningsList plan={result} />
      <SkippedList plan={result} />

      <div>
        {/* A Posiciones, no al Resumen: es donde se ven las recién importadas buscando precio. */}
        <Link
          href="/portfolio/posiciones"
          className="inline-block rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-brand-fg transition hover:opacity-90"
        >
          {t("viewPortfolio")}
        </Link>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-surface-2 px-3 py-2">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-xl font-semibold tabular-nums text-foreground">{value}</dd>
    </div>
  );
}
