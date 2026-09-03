import { describe, expect, it } from "vitest";

import { CALCULATORS } from "./registry";
import {
  computePortfolioGoal,
  FIRE_CALCULATOR_SLUG,
  type PortfolioGoalInput,
} from "./portfolio-goal";

/** Objetivo típico: 24.000 €/año al 4 % → 600.000 € de patrimonio objetivo. */
const BASE: PortfolioGoalInput = {
  annualExpenses: 24000,
  withdrawalRate: 4,
  currentValue: 150000,
  contribution: 1000,
  frequency: "monthly",
  annualReturn: 5,
};

describe("computePortfolioGoal", () => {
  it("el slug del objetivo existe en el registro de calculadoras", () => {
    // Si alguien renombra la calculadora, los escenarios guardados dejarían de encontrarse:
    // este test lo convierte en un fallo ruidoso en vez de un bloque vacío en producción.
    expect(CALCULATORS.some((c) => c.slug === FIRE_CALCULATOR_SLUG)).toBe(true);
  });

  it("calcula objetivo, progreso y lo que falta con el patrimonio real", () => {
    const result = computePortfolioGoal(BASE);

    expect(result.target).toBe(600000);
    expect(result.current).toBe(150000);
    expect(result.progress).toBeCloseTo(25, 10);
    expect(result.remaining).toBe(450000);
    expect(result.reached).toBe(false);
  });

  it("estima los años que faltan al ritmo de aportación actual", () => {
    const result = computePortfolioGoal(BASE);

    // Coherente con la calculadora FIRE: 150k + 1.000 €/mes al 5 % tarda 16 años en llegar
    // a 600k (misma proyección, mismo motor).
    expect(result.yearsToTarget).toBe(16);
  });

  it("devuelve null cuando el objetivo no se alcanza en el horizonte proyectado", () => {
    const result = computePortfolioGoal({ ...BASE, contribution: 0, annualReturn: 0 });

    expect(result.yearsToTarget).toBeNull();
    expect(result.reached).toBe(false);
  });

  it("marca el objetivo como alcanzado y acota el progreso al 100 %", () => {
    const result = computePortfolioGoal({ ...BASE, currentValue: 900000 });

    expect(result.reached).toBe(true);
    expect(result.progress).toBe(100);
    expect(result.remaining).toBe(0);
    expect(result.yearsToTarget).toBe(0);
  });

  it("cartera vacía: progreso 0 y falta el objetivo entero", () => {
    const result = computePortfolioGoal({ ...BASE, currentValue: 0 });

    expect(result.current).toBe(0);
    expect(result.progress).toBe(0);
    expect(result.remaining).toBe(600000);
    expect(result.reached).toBe(false);
  });

  it("gasto anual cero: objetivo 0, alcanzado y sin porcentaje representable", () => {
    const result = computePortfolioGoal({ ...BASE, annualExpenses: 0, currentValue: 0 });

    expect(result.target).toBe(0);
    expect(result.progress).toBeNull();
    expect(result.remaining).toBe(0);
    expect(result.reached).toBe(true);
    expect(result.yearsToTarget).toBe(0);
  });

  it("tasa de retiro cero: hereda el 4 % por defecto de la calculadora FIRE", () => {
    const zero = computePortfolioGoal({ ...BASE, withdrawalRate: 0 });
    const four = computePortfolioGoal({ ...BASE, withdrawalRate: 4 });

    expect(zero.target).toBe(four.target);
  });

  it("una tasa de retiro alta reduce el objetivo", () => {
    const result = computePortfolioGoal({ ...BASE, withdrawalRate: 8 });

    expect(result.target).toBe(300000);
  });

  it("no deja escapar valores no finitos con entradas corruptas", () => {
    const result = computePortfolioGoal({
      annualExpenses: Number.NaN,
      withdrawalRate: Number.NaN,
      currentValue: Number.POSITIVE_INFINITY,
      contribution: Number.NaN,
      frequency: "monthly",
      annualReturn: Number.NaN,
    });

    expect(Number.isFinite(result.target)).toBe(true);
    expect(Number.isFinite(result.current)).toBe(true);
    expect(Number.isFinite(result.remaining)).toBe(true);
    expect(result.current).toBe(0);
  });

  it("un patrimonio negativo se trata como cartera vacía", () => {
    const result = computePortfolioGoal({ ...BASE, currentValue: -5000 });

    expect(result.current).toBe(0);
    expect(result.progress).toBe(0);
  });
});
