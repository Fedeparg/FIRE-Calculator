import { describe, expect, it } from "vitest";
import { computeFire } from "./fire.js";
import { defined } from "../assert.js";

const base = {
  annualExpenses: 24000,
  currentSavings: 20000,
  savings: 800,
  annualReturn: 5,
  withdrawalRate: 4,
};

describe("computeFire", () => {
  it("aplica la regla del 4 % (número FIRE = 25x el gasto anual)", () => {
    const r = computeFire(base);
    expect(r.fireNumber).toBe(600000);
  });

  it("usa una tasa de retiro distinta cuando se indica", () => {
    const r = computeFire({ ...base, withdrawalRate: 3 });
    expect(r.fireNumber).toBeCloseTo(24000 / 0.03, 6);
  });

  it("evita dividir por cero: tasa de retiro 0 cae al 4 % por defecto", () => {
    const r = computeFire({ ...base, withdrawalRate: 0 });
    expect(Number.isFinite(r.fireNumber)).toBe(true);
    expect(r.fireNumber).toBe(600000);
  });

  it("detecta que ya se es independiente si el patrimonio supera el objetivo", () => {
    const r = computeFire({ ...base, currentSavings: 700000 });
    expect(r.yearsToFire).toBe(0);
  });

  it("calcula años hasta FIRE y el patrimonio alcanza el objetivo en ese punto", () => {
    const r = computeFire(base);
    expect(r.yearsToFire).not.toBeNull();
    expect(r.yearsToFire).toBeGreaterThan(0);

    const reached = r.series.find((p) => p.year >= Math.ceil(defined(r.yearsToFire, "años hasta FIRE")));
    expect(reached?.value).toBeGreaterThanOrEqual(r.fireNumber);
  });

  it("devuelve null si no se alcanza en el horizonte de 60 años", () => {
    const r = computeFire({
      annualExpenses: 1_000_000,
      currentSavings: 0,
      savings: 1,
      annualReturn: 0,
      withdrawalRate: 4,
    });
    expect(r.yearsToFire).toBeNull();
    expect(r.series.length).toBeLessThanOrEqual(61);
  });

  it("golden: con los valores por defecto del componente tarda 27 años", () => {
    const r = computeFire({ ...base, frequency: "monthly", savingsGrowth: 0 });
    expect(r.fireNumber).toBe(600000);
    expect(r.yearsToFire).toBe(27);
  });

  it("mantiene el objetivo constante en toda la serie", () => {
    const r = computeFire(base);
    for (const point of r.series) {
      expect(point.target).toBe(r.fireNumber);
    }
  });
});
