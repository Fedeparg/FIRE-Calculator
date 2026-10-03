"use client";

import { useTranslations } from "next-intl";

import type { ImportPlan, ImportPlanPosition } from "@sextante/core/imports/types";
import { summarisePlan } from "@/features/portfolio/model/import-plan";
import { useFormat } from "@/shared/format/use-format";
import Button from "@/shared/ui/Button";
import DataTable, { type DataTableColumn } from "@/shared/ui/DataTable";
import DerivativesNotice from "./DerivativesNotice";
import ImportNotices from "./ImportNotices";

type Props = {
  plan: ImportPlan;
  importing: boolean;
  onConfirm: () => void;
};

/** Import preview: which positions are created or topped up, and with how many trades. */
export default function ImportPlanView({ plan, importing, onConfirm }: Props) {
  const t = useTranslations("portfolio.import.preview");
  const { formatCurrency, formatQuantity } = useFormat();
  const summary = summarisePlan(plan);
  const amount = "tabular-nums text-foreground";

  const columns: DataTableColumn<ImportPlanPosition>[] = [
    {
      key: "instrument",
      header: t("colInstrument"),
      rowHeader: true,
      cell: (p) => (
        <>
          <span className="block text-foreground">{p.name || p.isin}</span>
          <span className="block text-xs text-muted">{p.isin}</span>
          {p.blockedBy && <span className="mt-1 block text-xs text-warning">{t(`blocked.${p.blockedBy}`)}</span>}
          {p.isDerivative && <span className="mt-1 block text-xs text-muted">{t("derivativeTag")}</span>}
        </>
      ),
    },
    { key: "action", header: t("colAction"), cellClassName: "text-foreground", cell: (p) => t(`action.${p.action}`) },
    { key: "buys", header: t("colBuys"), align: "right", cellClassName: amount, cell: (p) => p.newBuys },
    { key: "sells", header: t("colSells"), align: "right", cellClassName: amount, cell: (p) => p.newSells },
    {
      key: "duplicates",
      header: t("colDuplicates"),
      align: "right",
      cellClassName: "tabular-nums text-muted",
      cell: (p) => p.duplicates,
    },
    {
      key: "resulting",
      header: t("colResulting"),
      align: "right",
      cellClassName: amount,
      cell: (p) =>
        p.resultingQuantity === null
          ? "—"
          : p.resultingQuantity === 0
            ? t("closed")
            : formatQuantity(p.resultingQuantity),
    },
    {
      key: "avgPrice",
      header: t("colAvgPrice"),
      align: "right",
      cellClassName: amount,
      // The importer only accepts trades in EUR (see the parser).
      cell: (p) => (p.resultingAvgPrice === null ? "—" : formatCurrency(p.resultingAvgPrice, "EUR")),
    },
  ];

  return (
    <section
      aria-labelledby="import-preview-title"
      className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-6"
    >
      <h2 id="import-preview-title" className="text-lg font-semibold text-foreground">
        {t("title")}
      </h2>

      {plan.income.created > 0 && (
        <p className="text-sm text-foreground">
          {t("income", { count: plan.income.created, reported: plan.income.reportedToAeat })}
        </p>
      )}

      {plan.positions.length === 0 ? (
        summary.incomeInFile === 0 && <p className="text-sm text-muted">{t("nothingToImport")}</p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label={t("statCreated")} value={summary.created} />
            <Stat label={t("statExtended")} value={summary.extended} />
            <Stat label={t("statNewLots")} value={plan.totals.newLots} />
            <Stat label={t("statDuplicates")} value={plan.totals.duplicates} />
          </dl>

          <DataTable
            caption={t("tableCaption")}
            captionVisible
            columns={columns}
            rows={plan.positions}
            rowKey={(p) => p.isin}
            minWidthClass="min-w-[40rem]"
            rowClassName="align-top"
          />
          <p className="text-xs text-muted">{t("avgPriceNote")}</p>
        </>
      )}

      {plan.positions.some((p) => p.isDerivative) && <DerivativesNotice />}
      <ImportNotices plan={plan} />

      {summary.canConfirm ? (
        <div>
          <Button size="lg" onClick={onConfirm} disabled={importing} className="text-sm">
            {importing
              ? t("confirming")
              : summary.lotsToImport > 0
                ? t("confirm", { count: summary.lotsToImport })
                : t("confirmIncome", { count: plan.income.created })}
          </Button>
        </div>
      ) : (
        (plan.positions.length > 0 || summary.incomeInFile > 0) && (
          <p className="text-sm text-muted">{t("alreadyImported")}</p>
        )
      )}
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
