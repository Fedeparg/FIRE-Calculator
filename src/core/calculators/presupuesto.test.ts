import { describe, expect, it } from "vitest";
import { computeBudget } from "./presupuesto";

describe("computeBudget", () => {
  it("calcula el ahorro y la tasa de ahorro", () => {
    const r = computeBudget({ income: 2000, needs: 1000, wants: 600 });
    expect(r.savings).toBe(400);
    expect(r.savingsRate).toBeCloseTo(20, 6);
  });

  it("expone el ahorro anual y los porcentajes por categoría", () => {
    const r = computeBudget({ income: 2000, needs: 1000, wants: 600 });
    expect(r.annualSavings).toBe(4800);
    expect(r.needsRate).toBeCloseTo(50, 6);
    expect(r.wantsRate).toBeCloseTo(30, 6);
    expect(r.savingsRate).toBeCloseTo(20, 6);
  });

  it("sin ingresos, los porcentajes son 0 (sin dividir por cero)", () => {
    const r = computeBudget({ income: 0, needs: 100, wants: 50 });
    expect(r.needsRate).toBe(0);
    expect(r.wantsRate).toBe(0);
  });

  it("aplica la regla 50/30/20 sobre los ingresos", () => {
    const r = computeBudget({ income: 2000, needs: 0, wants: 0 });
    expect(r.recommendedNeeds).toBe(1000);
    expect(r.recommendedWants).toBe(600);
    expect(r.recommendedSavings).toBe(400);
  });

  it("refleja ahorro negativo si se gasta de más", () => {
    const r = computeBudget({ income: 2000, needs: 1500, wants: 800 });
    expect(r.savings).toBe(-300);
    expect(r.savingsRate).toBeLessThan(0);
  });

  it("sin ingresos, tasa de ahorro 0 (sin dividir por cero)", () => {
    const r = computeBudget({ income: 0, needs: 0, wants: 0 });
    expect(r.savingsRate).toBe(0);
  });
});
