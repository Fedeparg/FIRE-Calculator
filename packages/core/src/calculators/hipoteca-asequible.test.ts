import { describe, expect, it } from "vitest";
import { computeAffordability } from "./hipoteca-asequible.js";

const base = {
  netMonthlyIncome: 2000,
  monthlyDebts: 0,
  downPayment: 40000,
  annualRate: 3,
  termYears: 30,
};

describe("computeAffordability", () => {
  it("aplica la regla del esfuerzo (35% por defecto)", () => {
    const r = computeAffordability(base);
    expect(r.maxMonthlyPayment).toBeCloseTo(700, 6); // 2000 * 0.35
  });

  it("las deudas reducen la cuota disponible", () => {
    const r = computeAffordability({ ...base, monthlyDebts: 200 });
    expect(r.maxMonthlyPayment).toBeCloseTo(500, 6);
  });

  it("con los valores por defecto manda el ahorro (LTV 80% + gastos 12%)", () => {
    const r = computeAffordability(base);
    // 40.000 / (1 + 0,12 − 0,80) = 125.000 €; préstamo = 80% = 100.000 €
    expect(r.maxPrice).toBeCloseTo(125000, 4);
    expect(r.maxLoan).toBeCloseTo(100000, 4);
    expect(r.binding).toBe("savings");
  });

  it("el ahorro cubre exactamente la entrada más los gastos de compra", () => {
    const r = computeAffordability(base);
    expect(r.downPaymentNeeded + r.purchaseCostsAmount).toBeCloseTo(base.downPayment, 4);
  });

  it("más ahorro permite más precio mientras manda el ahorro", () => {
    const r = computeAffordability({ ...base, downPayment: 60000 });
    expect(r.maxPrice).toBeCloseTo(187500, 4); // 60.000 / 0,32
    expect(r.binding).toBe("savings");
  });

  it("si las deudas superan el límite, no hay préstamo y solo se compra al contado", () => {
    const r = computeAffordability({ ...base, monthlyDebts: 1000 });
    expect(r.maxMonthlyPayment).toBe(0);
    expect(r.maxLoan).toBe(0);
    expect(r.maxPrice).toBeCloseTo(40000 / 1.12, 4); // ahorro − gastos de compra
    expect(r.binding).toBe("income");
  });

  it("con mucho ahorro pasa a mandar la capacidad de pago", () => {
    const r = computeAffordability({ ...base, downPayment: 200000 });
    expect(r.binding).toBe("income");
    // el préstamo queda topado por la cuota (por debajo del 80% del precio).
    expect(r.maxLoan).toBeLessThan(0.8 * r.maxPrice);
    expect(r.estimatedMonthlyPayment).toBeCloseTo(r.maxMonthlyPayment, 0);
  });
});
