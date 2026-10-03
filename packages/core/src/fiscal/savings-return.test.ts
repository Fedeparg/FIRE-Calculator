import { describe, expect, it } from "vitest";

import { buildIncomeReport, type IncomeEvent } from "./income.js";
import { buildRealisedGainsReport } from "./realised-gains.js";
import { buildSavingsReturn, buildSavingsReturns } from "./savings-return.js";
import { takeItems } from "../arrays.js";

let seq = 0;
function event(overrides: Partial<IncomeEvent> & Pick<IncomeEvent, "kind" | "gross">): IncomeEvent {
  seq += 1;
  return {
    id: `e${seq}`,
    positionId: null,
    paidAt: "2025-06-01",
    isin: null,
    name: null,
    country: "ES",
    currency: "EUR",
    withholdingOrigin: 0,
    withholdingSpain: 0,
    reportedToAeat: false,
    source: "manual",
    grossSource: "manual",
    withholdingOriginSource: "manual",
    quantity: null,
    originalAmount: null,
    originalCurrency: null,
    createdAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

/** A tax year with a given sales balance: one buy at 0 and one sale at that price. */
function gainsYear(total: number) {
  return buildRealisedGainsReport(
    [
      {
        id: "p",
        ticker: "X",
        name: null,
        currency: "EUR",
        lots: [
          { id: "b", kind: "buy", quantity: 1, price: 0, fees: 0, tradedAt: "2024-01-02" },
          { id: "s", kind: "sell", quantity: 1, price: total, fees: 0, tradedAt: "2025-03-14" },
        ],
      },
    ],
    {},
  ).years[0];
}

describe("buildSavingsReturn", () => {
  it("reproduces the plan's example: offsets pending losses, applies the scale and double taxation", () => {
    const income = [
      event({ kind: "interest", gross: 286.4 }),
      event({ kind: "dividend", gross: 372.8, country: "US", withholdingOrigin: 55.92 }),
      // Switzerland withholds 35%; the treaty only allows deducting 15%.
      event({ kind: "dividend", gross: 40, country: "CH", withholdingOrigin: 14 }),
    ];
    const result = buildSavingsReturn({
      year: 2025,
      gains: gainsYear(953.49),
      income: buildIncomeReport(income, {}).years[0],
      incomeEvents: income,
      rates: {},
      pending: [{ originYear: 2023, kind: "gains", amount: 300 }],
    });

    expect(result.gainsBalance).toBeCloseTo(953.49, 10);
    expect(result.capitalIncomeBalance).toBeCloseTo(699.2, 10);
    expect(result.savingsBase.base).toBeCloseTo(1352.69, 10);
    expect(result.tax.tax).toBeCloseTo(257.01, 2);
    expect(result.doubleTaxation.deduction).toBeCloseTo(61.92, 2);
    expect(result.doubleTaxation.warnings).toEqual([
      expect.objectContaining({ code: "excess_withholding", country: "CH" }),
    ]);
    expect(result.netTax).toBeCloseTo(195.09, 2);
    expect(result.incomplete).toBe(false);
  });

  it("subtracts Spanish withholdings to give the contribution to the tax return's result", () => {
    const income = [event({ kind: "interest", gross: 100, withholdingSpain: 19 })];
    const result = buildSavingsReturn({
      year: 2025,
      gains: undefined,
      income: buildIncomeReport(income, {}).years[0],
      incomeEvents: income,
      rates: {},
      pending: [],
    });
    expect(result.netTax).toBeCloseTo(19, 10);
    expect(result.withholdingSpain).toBe(19);
    expect(result.result).toBeCloseTo(0, 10);
  });

  it("offsets a sales loss against capital income up to 25% and flags what is incomplete", () => {
    const income = [
      event({ kind: "interest", gross: 1000 }),
      event({ kind: "dividend", gross: 10, country: "DE", withholdingOrigin: null }),
    ];
    const result = buildSavingsReturn({
      year: 2025,
      gains: gainsYear(0),
      income: buildIncomeReport(income, {}).years[0],
      incomeEvents: income,
      rates: {},
      pending: [{ originYear: 2025, kind: "gains", amount: 1 }],
    });
    expect(result.capitalIncomeBalance).toBe(1010);
    expect(result.incomplete).toBe(true);
  });

  it("income that paid no foreign tax does not widen the double-taxation limit", () => {
    const income = [
      event({ kind: "interest", gross: 1000, country: "DE", withholdingOrigin: 0 }),
      event({ kind: "dividend", gross: 100, country: "DK", withholdingOrigin: 35 }),
    ];
    const result = buildSavingsReturn({
      year: 2025,
      gains: undefined,
      income: buildIncomeReport(income, {}).years[0],
      incomeEvents: income,
      rates: {},
      pending: [],
    });
    // Limit: average rate (19%) × 100 of income taxed in Denmark, not × 1,100.
    expect(result.doubleTaxation.deduction).toBeCloseTo(19, 2);
  });

  it("with no sales or payments, everything is 0", () => {
    const result = buildSavingsReturn({
      year: 2025,
      gains: undefined,
      income: undefined,
      incomeEvents: [],
      rates: {},
      pending: [],
    });
    expect(result).toMatchObject({ gainsBalance: 0, capitalIncomeBalance: 0, netTax: 0, result: 0, incomplete: false });
  });
});

describe("buildSavingsReturns", () => {
  it("carries one year's loss forward to the next and offsets it", () => {
    const losing = buildRealisedGainsReport(
      [
        {
          id: "p",
          ticker: "X",
          name: null,
          currency: "EUR",
          lots: [
            { id: "b", kind: "buy", quantity: 1, price: 1000, fees: 0, tradedAt: "2023-01-02" },
            { id: "s", kind: "sell", quantity: 1, price: 600, fees: 0, tradedAt: "2023-06-01" },
            { id: "b2", kind: "buy", quantity: 1, price: 0, fees: 0, tradedAt: "2024-01-02" },
            { id: "s2", kind: "sell", quantity: 1, price: 1000, fees: 0, tradedAt: "2025-03-14" },
          ],
        },
      ],
      {},
    ).years;
    const results = buildSavingsReturns({ gains: losing, income: [], incomeEvents: [], rates: {}, manualPending: [] });

    expect(results.map((r) => r.year)).toEqual([2025, 2023]);
    const [y2025, y2023] = takeItems(results, 2);
    expect(y2023.savingsBase.pending).toEqual([{ originYear: 2023, kind: "gains", amount: 400 }]);
    // 2024 has no data but is still walked through; in 2025 the 2023 loss offsets the gain.
    expect(y2025.savingsBase.base).toBeCloseTo(600, 10);
  });

  it("applies manual balances for years Sextante does not compute and lets them expire after four years", () => {
    const income = [
      event({ kind: "interest", gross: 100, paidAt: "2021-06-01" }),
      event({ kind: "interest", gross: 100, paidAt: "2026-06-01" }),
    ];
    const results = buildSavingsReturns({
      gains: [],
      income: buildIncomeReport(income, {}).years,
      incomeEvents: income,
      rates: {},
      manualPending: [{ originYear: 2020, kind: "capitalIncome", amount: 500 }],
    });
    const [y2026, y2021] = takeItems(results, 2);
    expect(y2021.savingsBase.base).toBe(0);
    // 400 from 2020 were left: they expire in 2025 (four years: 2021-2024).
    expect(y2026.savingsBase.base).toBeCloseTo(100, 10);
  });

  it("has no tax years without data", () => {
    expect(buildSavingsReturns({ gains: [], income: [], incomeEvents: [], rates: {}, manualPending: [] })).toEqual([]);
  });
});
