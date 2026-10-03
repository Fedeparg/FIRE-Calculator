// Summary of an import preview: what the screen reports before confirming.
// Pure (no React), testable in node.

import type { ImportPlan } from "@sextante/core/imports/types";

export type ImportPlanSummary = {
  /** New positions that will be created (excluding blocked ones). */
  created: number;
  /** Existing positions that will get lots added (excluding blocked ones). */
  extended: number;
  /** Trades that will actually be imported: new buys and sells of non-blocked positions. */
  lotsToImport: number;
  /** Income in the file, new or already imported: if there is any, the file is not "empty". */
  incomeInFile: number;
  /** There is something to confirm (new lots or income). */
  canConfirm: boolean;
};

export function summarisePlan(plan: ImportPlan): ImportPlanSummary {
  const importable = plan.positions.filter((p) => !p.blockedBy);
  const lotsToImport = importable.reduce((sum, p) => sum + p.newBuys + p.newSells, 0);
  return {
    created: importable.filter((p) => p.action === "create").length,
    extended: importable.filter((p) => p.action === "extend").length,
    lotsToImport,
    incomeInFile: plan.income.created + plan.income.duplicates,
    canConfirm: lotsToImport > 0 || plan.income.created > 0,
  };
}
