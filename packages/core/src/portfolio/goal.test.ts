import { describe, expect, it } from "vitest";

import {
  computeAmountGoal,
  computeGoalProgress,
  computePortfolioGoal,
  goalModeFromInputs,
  monthlyContribution,
  resolveGoalTarget,
  simulatePortfolioGoal,
  type PortfolioGoalInput,
} from "./goal.js";

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
    const result = simulatePortfolioGoal({ ...SIM, contribution: 0, annualReturn: 0, volatility: 0 }, { paths: 50 });

    expect(result.reachRate).toBe(0);
    expect(result.successRate).toBe(0);
  });

  it("la aportación mensual equivale a la anual con el mismo total", () => {
    const annual = simulatePortfolioGoal(SIM, { paths: 300 });
    const monthly = simulatePortfolioGoal({ ...SIM, frequency: "monthly", contribution: 1000 }, { paths: 300 });

    expect(monthly.successRate).toBe(annual.successRate);
  });
});

describe("goalModeFromInputs", () => {
  it("lee el modo cantidad y trata el resto (o su ausencia) como FIRE", () => {
    expect(goalModeFromInputs({ goalMode: "amount" })).toBe("amount");
    expect(goalModeFromInputs({ goalMode: "fire" })).toBe("fire");
    expect(goalModeFromInputs({ goalMode: "otro" })).toBe("fire");
    expect(goalModeFromInputs({})).toBe("fire");
    expect(goalModeFromInputs(null)).toBe("fire");
  });
});

describe("computeAmountGoal", () => {
  const AMOUNT = {
    targetAmount: 100000,
    years: 10,
    currentValue: 20000,
    contribution: 500,
    frequency: "monthly" as const,
    annualReturn: 5,
  };

  it("la aportación necesaria lleva justo al objetivo en el plazo", () => {
    const result = computeAmountGoal(AMOUNT);
    expect(result.requiredContribution).not.toBeNull();
    const again = computeAmountGoal({ ...AMOUNT, contribution: result.requiredContribution ?? 0 });
    expect(again.projectedAtDeadline).toBeCloseTo(100000, 4);
    expect(again.onTrack).toBe(true);
  });

  it("al ritmo actual llega si la proyección al final del plazo supera el objetivo", () => {
    const result = computeAmountGoal(AMOUNT);
    // 20.000 € + 500 €/mes al 5 % durante 10 años ≈ 110.600 €.
    expect(result.projectedAtDeadline).toBeGreaterThan(100000);
    expect(result.onTrack).toBe(true);
    expect(result.requiredContribution).toBeLessThan(500);
    expect(result.yearsToTarget).toBeLessThanOrEqual(10);
    expect(result.progress).toBeCloseTo(20, 10);
  });

  it("no llega con una aportación insuficiente", () => {
    const result = computeAmountGoal({ ...AMOUNT, contribution: 100 });
    expect(result.onTrack).toBe(false);
    expect(result.requiredContribution).toBeGreaterThan(100);
  });

  it("con rentabilidad 0 reparte lo que falta entre los periodos", () => {
    const result = computeAmountGoal({ ...AMOUNT, annualReturn: 0 });
    expect(result.requiredContribution).toBeCloseTo(80000 / 120, 10);
    expect(result.projectedAtDeadline).toBeCloseTo(20000 + 500 * 120, 6);
  });

  it("plazo 0 sin haber llegado: no hay aportación posible", () => {
    const result = computeAmountGoal({ ...AMOUNT, years: 0 });
    expect(result.deadlineYears).toBe(0);
    expect(result.requiredContribution).toBeNull();
    expect(result.projectedAtDeadline).toBe(20000);
    expect(result.onTrack).toBe(false);
  });

  it("ya alcanzado: nada que aportar, aunque el plazo sea 0", () => {
    const result = computeAmountGoal({ ...AMOUNT, currentValue: 150000, years: 0 });
    expect(result.reached).toBe(true);
    expect(result.requiredContribution).toBe(0);
    expect(result.yearsToTarget).toBe(0);
    expect(result.progress).toBe(100);
    expect(result.onTrack).toBe(true);
  });

  it("si el crecimiento del capital basta, la aportación necesaria es 0", () => {
    const result = computeAmountGoal({ ...AMOUNT, currentValue: 70000, contribution: 0 });
    expect(result.requiredContribution).toBe(0);
    expect(result.onTrack).toBe(true);
  });

  it("con rentabilidad negativa la aportación necesaria sube", () => {
    const flat = computeAmountGoal({ ...AMOUNT, annualReturn: 0 });
    const negative = computeAmountGoal({ ...AMOUNT, annualReturn: -3 });
    expect(negative.requiredContribution).toBeGreaterThan(flat.requiredContribution ?? 0);
  });

  it("redondea el plazo a años enteros y trata entradas no válidas como 0", () => {
    expect(computeAmountGoal({ ...AMOUNT, years: 9.6 }).deadlineYears).toBe(10);
    expect(computeAmountGoal({ ...AMOUNT, years: Number.NaN }).deadlineYears).toBe(0);
    const empty = computeAmountGoal({ ...AMOUNT, targetAmount: -5 });
    expect(empty.target).toBe(0);
    expect(empty.reached).toBe(true);
    expect(empty.progress).toBeNull();
  });

  it("sin llegar en 60 años, yearsToTarget es null", () => {
    const result = computeAmountGoal({ ...AMOUNT, targetAmount: 1e12, contribution: 0, annualReturn: 0 });
    expect(result.yearsToTarget).toBeNull();
  });
});

describe("computeGoalProgress", () => {
  const COMMON = { currentValue: 150000, contribution: 1000, frequency: "monthly", annualReturn: 5 } as const;

  it("modo FIRE: equivale a computePortfolioGoal con su modo", () => {
    const outcome = computeGoalProgress({ mode: "fire", annualExpenses: 24000, withdrawalRate: 4 }, COMMON);
    expect(outcome).toEqual({ mode: "fire", ...computePortfolioGoal(BASE) });
  });

  it("modo cantidad: equivale a computeAmountGoal con su modo", () => {
    const outcome = computeGoalProgress({ mode: "amount", targetAmount: 300000, targetYears: 10 }, COMMON);
    expect(outcome).toEqual({
      mode: "amount",
      ...computeAmountGoal({ ...COMMON, targetAmount: 300000, years: 10 }),
    });
  });

  it("objetivo ya alcanzado: 0 años y nada que aportar", () => {
    const fire = computeGoalProgress({ mode: "fire", annualExpenses: 4000, withdrawalRate: 4 }, COMMON);
    expect(fire).toMatchObject({ mode: "fire", reached: true, yearsToTarget: 0, remaining: 0 });
    const amount = computeGoalProgress({ mode: "amount", targetAmount: 100000, targetYears: 5 }, COMMON);
    expect(amount).toMatchObject({ mode: "amount", reached: true, requiredContribution: 0, onTrack: true });
  });

  it("plazo 0 años: solo se llega si ya se tiene la cifra", () => {
    const outcome = computeGoalProgress({ mode: "amount", targetAmount: 200000, targetYears: 0 }, COMMON);
    expect(outcome).toMatchObject({ deadlineYears: 0, projectedAtDeadline: 150000, onTrack: false });
  });

  it("rentabilidad 0: la aportación necesaria es lineal", () => {
    const outcome = computeGoalProgress(
      { mode: "amount", targetAmount: 250000, targetYears: 10 },
      { ...COMMON, annualReturn: 0 },
    );
    expect(outcome).toMatchObject({ mode: "amount", requiredContribution: 100000 / 120 });
  });
});

describe("resolveGoalTarget", () => {
  it("deduce el modo FIRE", () => {
    expect(resolveGoalTarget({ annualExpenses: 24000, withdrawalRate: 4 })).toEqual({
      target: { mode: "fire", annualExpenses: 24000, withdrawalRate: 4 },
    });
  });

  it("deduce el modo cantidad", () => {
    expect(resolveGoalTarget({ targetAmount: 1000, targetYears: 5 })).toEqual({
      target: { mode: "amount", targetAmount: 1000, targetYears: 5 },
    });
  });

  it("acepta ceros como valores presentes", () => {
    expect(resolveGoalTarget({ targetAmount: 0, targetYears: 0 })).toEqual({
      target: { mode: "amount", targetAmount: 0, targetYears: 0 },
    });
  });

  it("rechaza entradas incompletas o mezcladas", () => {
    expect(resolveGoalTarget({})).toEqual({ error: "fireIncomplete" });
    expect(resolveGoalTarget({ annualExpenses: 1 })).toEqual({ error: "fireIncomplete" });
    expect(resolveGoalTarget({ targetAmount: 1 })).toEqual({ error: "amountIncomplete" });
    expect(resolveGoalTarget({ targetYears: 1, annualExpenses: 1 })).toEqual({ error: "amountIncomplete" });
    expect(resolveGoalTarget({ targetAmount: 1, targetYears: 1, withdrawalRate: 4 })).toEqual({
      error: "mixedModes",
    });
  });
});
