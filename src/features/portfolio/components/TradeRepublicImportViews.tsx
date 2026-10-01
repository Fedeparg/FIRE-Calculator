"use client";

import { useTranslations } from "next-intl";

import type { ImportPlan, ImportResult } from "@sextante/core/imports/types";
import Notice from "@/shared/ui/Notice";
import { Link } from "@/i18n/navigation";
import { useFormat } from "@/lib/format";
import DerivativesNotice from "./DerivativesNotice";

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

export function PlanView({
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

export function ResultView({ result, formatQuantity }: { result: ImportResult; formatQuantity: FormatQuantity }) {
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
