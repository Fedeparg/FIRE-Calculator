import { describe, expect, it } from "vitest";
import { computeMortgage } from "./hipoteca.js";

describe("computeMortgage", () => {
  it("sin interés reparte el capital en cuotas iguales", () => {
    const r = computeMortgage({ principal: 180000, annualRate: 0, years: 30 });
    expect(r.monthlyPayment).toBeCloseTo(500, 6); // 180000 / 360
    expect(r.totalPaid).toBeCloseTo(180000, 4);
    expect(r.totalInterest).toBeCloseTo(0, 4);
  });

  it("coincide con la fórmula francesa de la cuota", () => {
    const principal = 100000;
    const annualRate = 3;
    const years = 30;
    const i = annualRate / 100 / 12;
    const n = years * 12;
    const expected = (principal * i) / (1 - Math.pow(1 + i, -n));

    const r = computeMortgage({ principal, annualRate, years });
    expect(r.monthlyPayment).toBeCloseTo(expected, 2);
    expect(r.totalInterest).toBeGreaterThan(0);
  });

  it("amortiza el capital por completo (saldo final ≈ 0)", () => {
    const r = computeMortgage({ principal: 250000, annualRate: 2.5, years: 25 });
    expect(r.schedule.at(-1)?.balance).toBeCloseTo(0, 2);
  });

  it("produce una fila por año", () => {
    const r = computeMortgage({ principal: 100000, annualRate: 3, years: 20 });
    expect(r.schedule).toHaveLength(20);
    expect(r.schedule.at(-1)?.year).toBe(20);
  });

  it("el saldo pendiente nunca es negativo y decrece", () => {
    const r = computeMortgage({ principal: 100000, annualRate: 4, years: 15 });
    let prev = Number.POSITIVE_INFINITY;
    for (const row of r.schedule) {
      expect(row.balance).toBeGreaterThanOrEqual(0);
      expect(row.balance).toBeLessThan(prev);
      prev = row.balance;
    }
  });

  it("la suma de capital amortizado iguala el principal", () => {
    const principal = 150000;
    const r = computeMortgage({ principal, annualRate: 3.2, years: 20 });
    const totalPrincipal = r.schedule.reduce((s, row) => s + row.principalPaid, 0);
    expect(totalPrincipal).toBeCloseTo(principal, 2);
  });

  it("sin comisiones ni seguros, la TAE es la capitalización mensual del TIN", () => {
    const r = computeMortgage({ principal: 180000, annualRate: 3, years: 30 });
    const expected = (Math.pow(1 + 3 / 100 / 12, 12) - 1) * 100; // ≈ 3,0416 %
    expect(r.apr).toBeCloseTo(expected, 4);
    expect(r.openingCost).toBe(0);
    expect(r.insuranceCost).toBe(0);
    expect(r.totalCostWithFees).toBeCloseTo(r.totalPaid, 4);
  });

  it("la comisión de apertura y los seguros suben la TAE por encima del TIN", () => {
    const plain = computeMortgage({ principal: 180000, annualRate: 3, years: 30 });
    const withFees = computeMortgage({
      principal: 180000,
      annualRate: 3,
      years: 30,
      openingFeeRate: 0.5,
      annualInsurance: 300,
    });
    expect(withFees.apr).toBeGreaterThan(plain.apr);
    expect(withFees.openingCost).toBeCloseTo(900, 6); // 0,5% de 180.000
    expect(withFees.insuranceCost).toBeCloseTo(9000, 6); // 300 × 30
    expect(withFees.totalCostWithFees).toBeCloseTo(plain.totalPaid + 900 + 9000, 4);
    // la cuota (capital + intereses) no cambia.
    expect(withFees.monthlyPayment).toBeCloseTo(plain.monthlyPayment, 6);
  });
});
