import { describe, expect, it } from "vitest";
import { computeEarlyRepayment } from "./amortizacion-anticipada";
import { computeMortgage } from "./hipoteca";

const base = {
  pendingPrincipal: 150000,
  annualRate: 3,
  remainingYears: 25,
};

describe("computeEarlyRepayment", () => {
  it("sin aportación extra no hay ahorro en ninguna opción", () => {
    const r = computeEarlyRepayment({ ...base, extraPayment: 0 });
    expect(r.reducePayment.interestSaved).toBeCloseTo(0, 2);
    expect(r.reduceTerm.interestSaved).toBeCloseTo(0, 2);
  });

  it("la cuota base coincide con la calculadora de hipoteca", () => {
    const r = computeEarlyRepayment({ ...base, extraPayment: 0 });
    const mortgage = computeMortgage({
      principal: base.pendingPrincipal,
      annualRate: base.annualRate,
      years: base.remainingYears,
    });
    expect(r.monthlyPaymentBefore).toBeCloseTo(mortgage.monthlyPayment, 6);
  });

  it("una aportación extra ahorra intereses en ambas opciones", () => {
    const r = computeEarlyRepayment({ ...base, extraPayment: 20000 });
    expect(r.reducePayment.interestSaved).toBeGreaterThan(0);
    expect(r.reduceTerm.interestSaved).toBeGreaterThan(0);
  });

  it("reducir plazo ahorra más intereses que reducir cuota", () => {
    const r = computeEarlyRepayment({ ...base, extraPayment: 20000 });
    expect(r.reduceTerm.interestSaved).toBeGreaterThan(r.reducePayment.interestSaved);
    expect(r.reduceTerm.monthsSaved).toBeGreaterThan(0);
  });

  it("reducir cuota baja la mensualidad", () => {
    const r = computeEarlyRepayment({ ...base, extraPayment: 20000 });
    expect(r.reducePayment.newMonthlyPayment).toBeLessThan(r.monthlyPaymentBefore);
  });

  it("sin comisión, el ahorro neto iguala al ahorro de intereses", () => {
    const r = computeEarlyRepayment({ ...base, extraPayment: 20000 });
    expect(r.prepaymentFee).toBe(0);
    expect(r.reduceTerm.netSaved).toBeCloseTo(r.reduceTerm.interestSaved, 6);
    expect(r.reducePayment.netSaved).toBeCloseTo(r.reducePayment.interestSaved, 6);
  });

  it("la comisión por amortización se paga aparte y reduce el ahorro neto", () => {
    const r = computeEarlyRepayment({ ...base, extraPayment: 20000, compensationRate: 2 });
    expect(r.prepaymentFee).toBeCloseTo(400, 6); // 2% de 20.000
    expect(r.reduceTerm.netSaved).toBeCloseTo(r.reduceTerm.interestSaved - 400, 6);
    expect(r.reducePayment.netSaved).toBeCloseTo(r.reducePayment.interestSaved - 400, 6);
  });
});
