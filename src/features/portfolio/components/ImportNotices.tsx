"use client";

import { useTranslations } from "next-intl";

import type { ImportPlan, ImportResult } from "@sextante/core/imports/types";
import Notice from "@/shared/ui/Notice";

/** Warnings and discarded rows of an import; shared by the preview and the result. */
export default function ImportNotices({ plan }: { plan: ImportPlan | ImportResult }) {
  return (
    <>
      <WarningsList plan={plan} />
      <SkippedList plan={plan} />
    </>
  );
}

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
