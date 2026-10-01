// Casos de borde con significado propio (tasa 0, plazo 0, entradas negativas o extremas) de las
// calculadoras que no los cubrían. La tabla genérica de `edge-inputs.test.ts` solo garantiza que no
// lancen y que sean finitas; aquí se fija además QUÉ resultado es el correcto.

import { describe, expect, it } from "vitest";
import { computeRetirement } from "./ahorro-jubilacion.js";
import { computeEarlyRepayment } from "./amortizacion-anticipada.js";
import { computeAffordability } from "./hipoteca-asequible.js";
import { computeWealthTax } from "./impuesto-patrimonio.js";
import { computePayrollWithholding } from "./irpf-nomina.js";
import { computeHolidayRental } from "./rentabilidad-alquiler-vacacional.js";
import { computeStaking } from "./staking.js";

describe("computeStaking: bordes", () => {
  it("con APY 0 no hay recompensas ni retención", () => {
    const r = computeStaking({ principal: 5000, apy: 0, years: 3 });
    expect(r.rewards).toBe(0);
    expect(r.withheld).toBe(0);
    expect(r.netFinalValue).toBe(5000);
  });

  it("con 0 años devuelve el principal intacto", () => {
    const r = computeStaking({ principal: 5000, apy: 8, years: 0 });
    expect(r.rewards).toBe(0);
    expect(r.netFinalValue).toBe(5000);
    expect(r.series).toHaveLength(1);
  });

  it("con principal 0 no hay nada que rendir", () => {
    expect(computeStaking({ principal: 0, apy: 8, years: 3 }).netFinalValue).toBe(0);
  });

  it("un APY negativo (pérdida) no genera retención negativa", () => {
    const r = computeStaking({ principal: 5000, apy: -10, years: 2 });
    expect(r.rewards).toBeLessThan(0);
    expect(r.withheld).toBe(0);
    expect(r.netFinalValue).toBeCloseTo(5000 + r.rewards, 6);
  });

  it("acota la retención a 0-100 %", () => {
    const all = computeStaking({ principal: 1000, apy: 10, years: 1, withholdingRate: 500 });
    expect(all.netRewards).toBeCloseTo(0, 9);
    const none = computeStaking({ principal: 1000, apy: 10, years: 1, withholdingRate: -5 });
    expect(none.withheld).toBe(0);
  });
});

describe("computeAffordability: bordes", () => {
  const base = { netMonthlyIncome: 3000, monthlyDebts: 200, downPayment: 40000, termYears: 30 };

  it("con tipo 0 el préstamo máximo es cuota × meses", () => {
    const r = computeAffordability({ ...base, annualRate: 0 });
    expect(r.maxMonthlyPayment).toBeCloseTo(3000 * 0.35 - 200, 9);
    expect(r.maxLoan).toBeLessThanOrEqual(r.maxMonthlyPayment * 360 + 1e-6);
    expect(Number.isFinite(r.estimatedMonthlyPayment)).toBe(true);
  });

  it("con plazo 0 se trata como 1 año", () => {
    expect(computeAffordability({ ...base, annualRate: 3, termYears: 0 })).toEqual(
      computeAffordability({ ...base, annualRate: 3, termYears: 1 }),
    );
  });

  it("sin ingresos o con deudas que se los comen no hay hipoteca", () => {
    const noIncome = computeAffordability({ ...base, netMonthlyIncome: 0, annualRate: 3 });
    expect(noIncome.maxMonthlyPayment).toBe(0);
    expect(noIncome.maxLoan).toBe(0);
    const overIndebted = computeAffordability({ ...base, monthlyDebts: 5000, annualRate: 3 });
    expect(overIndebted.maxLoan).toBe(0);
  });

  it("sin ahorro no hay entrada que pagar y el precio máximo es 0", () => {
    const r = computeAffordability({ ...base, downPayment: 0, annualRate: 3 });
    expect(r.maxPrice).toBe(0);
    expect(r.binding).toBe("savings");
  });

  it("con LTV 0 el banco no financia nada y manda el ahorro", () => {
    const r = computeAffordability({ ...base, annualRate: 3, maxLtv: 0 });
    expect(r.maxLoan).toBe(0);
    expect(Number.isFinite(r.maxPrice)).toBe(true);
  });
});

describe("computeEarlyRepayment: bordes", () => {
  const base = { pendingPrincipal: 100000, remainingYears: 20, extraPayment: 20000 };

  it("con tipo 0 reducir plazo ahorra meses exactos y ningún interés", () => {
    const r = computeEarlyRepayment({ ...base, annualRate: 0 });
    expect(r.totalInterestBefore).toBeCloseTo(0, 6);
    expect(r.reduceTerm.newMonths).toBe(192); // 80.000 / (100.000 / 240)
    expect(r.reduceTerm.monthsSaved).toBe(48);
    expect(r.reduceTerm.interestSaved).toBeCloseTo(0, 6);
    expect(r.reducePayment.newMonthlyPayment).toBeCloseTo(80000 / 240, 9);
  });

  it("con 0 años restantes se trata como 1 año", () => {
    const r = computeEarlyRepayment({ ...base, annualRate: 3, remainingYears: 0 });
    expect(r).toEqual(computeEarlyRepayment({ ...base, annualRate: 3, remainingYears: 1 }));
    expect(r.reduceTerm.newMonths).toBeLessThanOrEqual(12);
  });

  it("amortizar todo el capital deja 0 meses y 0 cuota", () => {
    const r = computeEarlyRepayment({ ...base, annualRate: 3, extraPayment: 1e9 });
    expect(r.reduceTerm.newMonths).toBe(0);
    expect(r.reduceTerm.monthsSaved).toBe(240);
    expect(r.reducePayment.newMonthlyPayment).toBe(0);
    expect(r.reduceTerm.interestSaved).toBeCloseTo(r.totalInterestBefore, 6);
  });

  it("sin amortización extra no se ahorra nada", () => {
    const r = computeEarlyRepayment({ ...base, annualRate: 3, extraPayment: 0 });
    expect(r.reducePayment.interestSaved).toBeCloseTo(0, 6);
    expect(r.reduceTerm.monthsSaved).toBe(0);
    expect(r.prepaymentFee).toBe(0);
  });

  it("sin capital pendiente no hay nada que calcular", () => {
    const r = computeEarlyRepayment({ ...base, pendingPrincipal: 0, annualRate: 3 });
    expect(r.monthlyPaymentBefore).toBe(0);
    expect(r.reduceTerm.newMonths).toBe(0);
  });
});

describe("computePayrollWithholding: bordes", () => {
  it("con bruto 0 todo es 0 y no hay división por cero", () => {
    const r = computePayrollWithholding({ grossAnnual: 0 });
    expect(r.grossPerPayment).toBe(0);
    expect(r.withholdingPerPayment).toBe(0);
    expect(r.withholdingRate).toBe(0);
    expect(r.annualWithholding).toBe(0);
  });

  it("un bruto negativo se trata como 0", () => {
    expect(computePayrollWithholding({ grossAnnual: -1000 })).toEqual(computePayrollWithholding({ grossAnnual: 0 }));
  });

  it("un número de pagas distinto de 12 se trata como 14", () => {
    const base = { grossAnnual: 30000 };
    expect(computePayrollWithholding({ ...base, payments: 0 }).grossPerPayment).toBeCloseTo(30000 / 14, 9);
    expect(computePayrollWithholding({ ...base, payments: 12 }).grossPerPayment).toBe(2500);
  });

  it("con un salario por debajo del mínimo exento la retención es 0", () => {
    expect(computePayrollWithholding({ grossAnnual: 8000 }).annualWithholding).toBe(0);
  });
});

describe("computeWealthTax: bordes", () => {
  it("con patrimonio 0 o por debajo del mínimo exento no hay cuota", () => {
    expect(computeWealthTax({ totalWealth: 0, primaryResidenceValue: 0 }).tax).toBe(0);
    const below = computeWealthTax({ totalWealth: 600000, primaryResidenceValue: 0, exemptMinimum: 700000 });
    expect(below.taxableBase).toBe(0);
    expect(below.tax).toBe(0);
  });

  it("la vivienda habitual solo exime hasta 300.000 €", () => {
    const r = computeWealthTax({ totalWealth: 2000000, primaryResidenceValue: 1000000, exemptMinimum: 0 });
    expect(r.residenceExemption).toBe(300000);
    expect(r.taxableBase).toBe(1700000);
  });

  it("una bonificación del 100 % anula la cuota y fuera de rango se acota", () => {
    const full = computeWealthTax({ totalWealth: 3000000, primaryResidenceValue: 0, regionalRebate: 100 });
    expect(full.grossTax).toBeGreaterThan(0);
    expect(full.tax).toBe(0);
    expect(computeWealthTax({ totalWealth: 3000000, primaryResidenceValue: 0, regionalRebate: 250 }).tax).toBe(0);
    expect(computeWealthTax({ totalWealth: 3000000, primaryResidenceValue: 0, regionalRebate: -50 }).tax).toBe(full.grossTax);
  });

  it("valores negativos se tratan como 0", () => {
    expect(computeWealthTax({ totalWealth: -5, primaryResidenceValue: -5 }).effectiveRate).toBe(0);
  });
});

describe("computeHolidayRental: bordes", () => {
  const base = {
    purchasePrice: 200000,
    purchaseCosts: 20000,
    nightlyRate: 100,
    occupiedNights: 180,
    managementRate: 20,
    annualExpenses: 3000,
  };

  it("con precio y costes 0 las rentabilidades son 0, no infinitas", () => {
    const r = computeHolidayRental({ ...base, purchasePrice: 0, purchaseCosts: 0 });
    expect(r.grossYield).toBe(0);
    expect(r.netYield).toBe(0);
    expect(r.grossIncome).toBe(18000);
  });

  it("acota las noches ocupadas a 365", () => {
    const r = computeHolidayRental({ ...base, occupiedNights: 1000 });
    expect(r.occupancyRate).toBe(100);
    expect(r.grossIncome).toBe(36500);
  });

  it("una estancia media de 0 noches se trata como 1 (sin dividir por cero)", () => {
    const r = computeHolidayRental({ ...base, avgStayNights: 0, cleaningFee: 30 });
    expect(r.stays).toBe(180);
    expect(r.cleaningCost).toBe(5400);
  });

  it("sin ocupación el neto es el gasto anual en negativo", () => {
    const r = computeHolidayRental({ ...base, occupiedNights: 0 });
    expect(r.netIncome).toBe(-3000);
    expect(r.stays).toBe(0);
  });

  it("una gestión por encima del 100 % se acota", () => {
    const r = computeHolidayRental({ ...base, managementRate: 400 });
    expect(r.managementCost).toBe(r.grossIncome);
  });
});

describe("computeRetirement: bordes", () => {
  const base = { currentSavings: 10000, monthlySavings: 500, annualReturn: 6 };

  it("con la misma edad de jubilación no hay años de proyección y la renta sale del ahorro actual", () => {
    const r = computeRetirement({ ...base, currentAge: 65, retirementAge: 65 });
    expect(r.yearsToRetirement).toBe(0);
    expect(r.finalValue).toBe(10000);
    expect(r.monthlyIncome).toBeCloseTo((10000 * 0.04) / 12, 9);
  });

  it("con una edad de jubilación anterior a la actual se trata como 0 años", () => {
    const r = computeRetirement({ ...base, currentAge: 70, retirementAge: 65 });
    expect(r.yearsToRetirement).toBe(0);
    expect(r.finalValue).toBe(10000);
  });

  it("con rentabilidad 0 el patrimonio es lo aportado", () => {
    const r = computeRetirement({ ...base, annualReturn: 0, currentAge: 30, retirementAge: 40 });
    expect(r.finalValue).toBeCloseTo(10000 + 500 * 12 * 10, 6);
    expect(r.totalInterest).toBeCloseTo(0, 6);
  });

  it("sin ahorro ni aportaciones la renta es 0", () => {
    const r = computeRetirement({ currentSavings: 0, monthlySavings: 0, annualReturn: 6, currentAge: 30, retirementAge: 65 });
    expect(r.monthlyIncome).toBe(0);
    expect(r.monthlyIncomeNominal).toBe(0);
  });

  it("con inflación la renta real queda por debajo de la nominal", () => {
    const r = computeRetirement({ ...base, currentAge: 30, retirementAge: 65, inflationRate: 2 });
    expect(r.monthlyIncome).toBeLessThan(r.monthlyIncomeNominal);
  });
});
