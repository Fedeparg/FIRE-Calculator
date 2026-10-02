import { describe, expect, it } from "vitest";

import { buildIncomeReport, type IncomeEvent } from "./income.js";
import { buildRealisedGainsReport } from "./realised-gains.js";
import { buildSavingsReturn } from "./savings-return.js";

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

/** Un ejercicio con un saldo de ventas dado: una compra a 0 y una venta a ese precio. */
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
  it("reproduce el ejemplo del plan: compensa pérdidas pendientes, aplica la escala y la doble imposición", () => {
    const income = [
      event({ kind: "interest", gross: 286.4 }),
      event({ kind: "dividend", gross: 372.8, country: "US", withholdingOrigin: 55.92 }),
      // Suiza retiene el 35 %; el convenio solo deja deducir el 15 %.
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

  it("resta las retenciones españolas para dar lo que aporta al resultado de la declaración", () => {
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

  it("compensa una pérdida de ventas con los rendimientos hasta el 25 % y marca lo incompleto", () => {
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

  it("sin ventas ni cobros, todo es 0", () => {
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
