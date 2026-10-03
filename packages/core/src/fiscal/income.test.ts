import { describe, expect, it } from "vitest";

import {
  buildIncomeReport,
  incomeCategoryOf,
  incomeRatesNeeded,
  withholdingsFitGross,
  type IncomeEvent,
} from "./income.js";

let seq = 0;
function event(overrides: Partial<IncomeEvent> & Pick<IncomeEvent, "kind" | "paidAt" | "gross">): IncomeEvent {
  seq += 1;
  return {
    id: `e${seq}`,
    positionId: null,
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

describe("incomeCategoryOf", () => {
  it("las recompensas del bróker van con los intereses", () => {
    expect(incomeCategoryOf("interest")).toBe("interest");
    expect(incomeCategoryOf("benefit")).toBe("interest");
    expect(incomeCategoryOf("dividend")).toBe("dividend");
  });
});

describe("buildIncomeReport", () => {
  it("sin cobros no hay ejercicios", () => {
    expect(buildIncomeReport([], {}).years).toEqual([]);
  });

  it("agrupa por ejercicio y separa intereses de dividendos", () => {
    const report = buildIncomeReport(
      [
        event({ kind: "interest", paidAt: "2025-07-01", gross: 10, withholdingSpain: 1.9 }),
        event({ kind: "benefit", paidAt: "2025-08-04", gross: 15, withholdingSpain: 2.85 }),
        event({
          kind: "dividend",
          paidAt: "2025-08-06",
          gross: 1.6,
          country: "NL",
          withholdingOrigin: 0.24,
          withholdingSpain: 0.26,
        }),
        event({ kind: "interest", paidAt: "2024-12-31", gross: 3 }),
      ],
      {},
    );

    expect(report.years.map((y) => y.year)).toEqual([2025, 2024]);
    const [y2025] = report.years;
    expect(y2025.interest.total).toMatchObject({ events: 2, gross: 25, withholdingSpain: 4.75 });
    expect(y2025.interest.total.net).toBeCloseTo(20.25, 10);
    expect(y2025.dividend.total).toMatchObject({
      events: 1,
      gross: 1.6,
      withholdingOrigin: 0.24,
      withholdingSpain: 0.26,
    });
    expect(y2025.dividend.total.net).toBeCloseTo(1.1, 10);
    expect(y2025.dividend.byCountry.map((c) => c.country)).toEqual(["NL"]);
  });

  it("cuenta aparte lo que el pagador ya comunicó a la AEAT", () => {
    const [year] = buildIncomeReport(
      [
        event({ kind: "interest", paidAt: "2025-03-01", gross: 11.78 }),
        event({ kind: "interest", paidAt: "2025-07-01", gross: 10, withholdingSpain: 1.9, reportedToAeat: true }),
      ],
      {},
    ).years;

    expect(year.interest.reported).toMatchObject({ events: 1, gross: 10 });
    expect(year.interest.pending).toMatchObject({ events: 1, gross: 11.78 });
    expect(year.interest.total.gross).toBeCloseTo(21.78, 10);
  });

  it("convierte los cobros en divisa con el tipo del BCE del día de cobro", () => {
    const [year] = buildIncomeReport(
      [
        event({
          kind: "dividend",
          paidAt: "2025-05-15",
          gross: 0.26,
          currency: "USD",
          country: "US",
          withholdingOrigin: 0.039,
        }),
      ],
      { USD: [{ date: "2025-05-15", unitsPerEur: 1.13 }] },
    ).years;
    expect(year.dividend.total.gross).toBeCloseTo(0.26 / 1.13, 10);
    expect(year.dividend.total.withholdingOrigin).toBeCloseTo(0.039 / 1.13, 10);
    expect(year.unconverted).toEqual([]);
  });

  it("deja fuera los cobros sin tipo y avisa de los dividendos extranjeros sin retención en origen conocida", () => {
    const [year] = buildIncomeReport(
      [
        event({ kind: "dividend", paidAt: "2025-05-15", gross: 1, currency: "HKD", country: "CN" }),
        event({ kind: "dividend", paidAt: "2025-05-16", gross: 2, country: "US", withholdingOrigin: null }),
        event({ kind: "dividend", paidAt: "2025-05-17", gross: 3, country: "ES", withholdingOrigin: null }),
      ],
      {},
    ).years;
    expect(year.unconverted).toEqual([{ currency: "HKD", events: 1 }]);
    expect(year.dividend.total.gross).toBe(5);
    expect(year.originUnknown).toBe(1);
  });

  it("cuenta aparte los dividendos con la retención en origen estimada", () => {
    const [year] = buildIncomeReport(
      [
        event({
          kind: "dividend",
          paidAt: "2025-05-15",
          gross: 1,
          country: "CN",
          withholdingOrigin: 0.1,
          withholdingOriginSource: "estimate",
        }),
        event({
          kind: "dividend",
          paidAt: "2025-05-16",
          gross: 1,
          country: "US",
          withholdingOrigin: 0.15,
          withholdingOriginSource: "market",
        }),
      ],
      {},
    ).years;
    expect(year.originEstimated).toBe(1);
    expect(year.originUnknown).toBe(0);
  });

  it("una anulación del bróker (íntegro negativo) resta", () => {
    const [year] = buildIncomeReport(
      [
        event({ kind: "dividend", paidAt: "2025-07-29", gross: 1.47, country: "CN" }),
        event({ kind: "dividend", paidAt: "2025-08-12", gross: -1.47, country: "CN" }),
        event({ kind: "dividend", paidAt: "2025-08-12", gross: 1.44, country: "CN" }),
      ],
      {},
    ).years;
    expect(year.dividend.total.gross).toBeCloseTo(1.44, 10);
  });
});

describe("incomeRatesNeeded", () => {
  it("pide las divisas distintas del euro desde el cobro más antiguo", () => {
    expect(
      incomeRatesNeeded([
        event({ kind: "dividend", paidAt: "2025-02-13", gross: 1, currency: "USD" }),
        event({ kind: "dividend", paidAt: "2024-07-29", gross: 1, currency: "HKD" }),
        event({ kind: "interest", paidAt: "2020-01-01", gross: 1 }),
      ]),
    ).toEqual({ currencies: ["HKD", "USD"], from: "2024-07-29" });
    expect(incomeRatesNeeded([event({ kind: "interest", paidAt: "2020-01-01", gross: 1 })])).toBeNull();
  });
});

describe("withholdingsFitGross", () => {
  it("acepta retenciones que suman exactamente el íntegro aunque en coma flotante no cuadre", () => {
    // 0.1 + 0.2 === 0.30000000000000004 > 0.3; 0.4 + 0.2 === 0.6000000000000001 > 0.6.
    expect(withholdingsFitGross(0.3, 0.1, 0.2)).toBe(true);
    expect(withholdingsFitGross(0.6, 0.4, 0.2)).toBe(true);
    // El 15 % en origen de 7,33 (1,0995) más el resto retenido en España: justo el íntegro.
    expect(withholdingsFitGross(7.33, 7.33 * 0.15, 6.2305)).toBe(true);
  });

  it("rechaza retenciones que superan el íntegro, aunque sea por una micro-unidad", () => {
    expect(withholdingsFitGross(10, 5, 5.000001)).toBe(false);
    expect(withholdingsFitGross(1, 1.5, 0)).toBe(false);
  });

  it("trata las retenciones ausentes como 0", () => {
    expect(withholdingsFitGross(10, null, undefined)).toBe(true);
    expect(withholdingsFitGross(10, undefined, 10)).toBe(true);
  });
});
