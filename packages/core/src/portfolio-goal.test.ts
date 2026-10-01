import { describe, expect, it } from "vitest";

import {
  computePortfolioGoal,
  monthlyContribution,
  simulatePortfolioGoal,
  type PortfolioGoalInput,
} from "./portfolio-goal.js";

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

describe("monthlyContribution", () => {
  it("conserva el total anual de la aportación", () => {
    expect(monthlyContribution(1000, "monthly")).toBe(1000);
    expect(monthlyContribution(12000, "annual")).toBe(1000);
    expect(monthlyContribution(3000, "quarterly")).toBe(1000);
    expect(monthlyContribution(100, "weekly")).toBeCloseTo(5200 / 12, 10);
  });
});

describe("simulatePortfolioGoal", () => {
  const SIM = { ...BASE, frequency: "annual" as const, contribution: 12000, volatility: 15, retirementYears: 40 };

  it("sin volatilidad coincide con el objetivo determinista en frecuencia anual", () => {
    const deterministic = computePortfolioGoal(SIM);
    const simulated = simulatePortfolioGoal({ ...SIM, volatility: 0 }, { paths: 50 });

    expect(simulated.fireNumber).toBe(deterministic.target);
    expect(simulated.yearsToFire.p50).toBe(deterministic.yearsToTarget);
    expect(simulated.reachRate).toBe(1);
  });

  it("usa el valor de mercado real como patrimonio de partida", () => {
    const result = simulatePortfolioGoal(SIM, { paths: 200 });

    expect(result.series[0].p50).toBe(150000);
  });

  it("una cartera que ya cubre el objetivo arranca retirada", () => {
    const result = simulatePortfolioGoal({ ...SIM, currentValue: 900000 }, { paths: 200 });

    expect(result.reachRate).toBe(1);
    expect(result.yearsToFire.p50).toBe(0);
  });

  it("una cartera vacía o no finita se trata como 0 y no produce NaN", () => {
    const empty = simulatePortfolioGoal({ ...SIM, currentValue: Number.NaN }, { paths: 200 });

    expect(empty.series[0].p50).toBe(0);
    expect(Number.isFinite(empty.successRate)).toBe(true);
  });

  it("sin aportación ni rentabilidad no se llega nunca", () => {
    const result = simulatePortfolioGoal(
      { ...SIM, contribution: 0, annualReturn: 0, volatility: 0 },
      { paths: 50 },
    );

    expect(result.reachRate).toBe(0);
    expect(result.successRate).toBe(0);
  });

  it("la aportación mensual equivale a la anual con el mismo total", () => {
    const annual = simulatePortfolioGoal(SIM, { paths: 300 });
    const monthly = simulatePortfolioGoal({ ...SIM, frequency: "monthly", contribution: 1000 }, { paths: 300 });

    expect(monthly.successRate).toBe(annual.successRate);
  });
});
