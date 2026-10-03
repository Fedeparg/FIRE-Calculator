import { describe, expect, it } from "vitest";

import type { ImportPlan, ImportPlanPosition } from "@sextante/core/imports/types";
import { summarisePlan } from "./import-plan";

const position = (overrides: Partial<ImportPlanPosition>): ImportPlanPosition => ({
  isin: "IE00B4L5Y983",
  name: "iShares Core MSCI World",
  assetClass: "fund",
  action: "create",
  newBuys: 0,
  newSells: 0,
  duplicates: 0,
  currentQuantity: 0,
  resultingQuantity: 1,
  resultingAvgPrice: 1,
  blockedBy: null,
  isDerivative: false,
  ...overrides,
});

const plan = (
  positions: ImportPlanPosition[],
  income = { created: 0, duplicates: 0, reportedToAeat: 0 },
): ImportPlan => ({
  broker: "Trade Republic",
  positions,
  totals: { newLots: 0, duplicates: 0 },
  income,
  skipped: [],
  warnings: [],
});

describe("summarisePlan", () => {
  it("cuenta altas, ampliaciones y operaciones sin las posiciones bloqueadas", () => {
    const summary = summarisePlan(
      plan([
        position({ action: "create", newBuys: 2, newSells: 1 }),
        position({ isin: "B", action: "extend", newBuys: 3 }),
        position({ isin: "C", action: "create", newBuys: 5, blockedBy: "NEGATIVE_QUANTITY" }),
      ]),
    );

    expect(summary).toEqual({ created: 1, extended: 1, lotsToImport: 6, incomeInFile: 0, canConfirm: true });
  });

  it("solo con cobros nuevos también se puede confirmar", () => {
    const summary = summarisePlan(plan([], { created: 2, duplicates: 1, reportedToAeat: 0 }));

    expect(summary).toMatchObject({ lotsToImport: 0, incomeInFile: 3, canConfirm: true });
  });

  it("un fichero ya importado no tiene nada que confirmar", () => {
    const summary = summarisePlan(
      plan([position({ duplicates: 4 })], { created: 0, duplicates: 2, reportedToAeat: 0 }),
    );

    expect(summary).toMatchObject({ lotsToImport: 0, incomeInFile: 2, canConfirm: false });
  });
});
