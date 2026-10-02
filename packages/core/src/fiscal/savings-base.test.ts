import { describe, expect, it } from "vitest";

import { computeSavingsBase, savingsTax, type PendingNegative } from "./savings-base.js";

const run = (gainsBalance: number, capitalIncomeBalance: number, pending: PendingNegative[] = [], year = 2025) =>
  computeSavingsBase({ year, gainsBalance, capitalIncomeBalance, pending });

describe("computeSavingsBase", () => {
  it("ejercicio sin nada: base 0 y nada pendiente", () => {
    const r = run(0, 0);
    expect(r).toMatchObject({ base: 0, compensations: [], pending: [], expired: [], totalCompensated: 0 });
  });

  it("sin negativos: la base es la suma de los saldos", () => {
    expect(run(1000, 500).base).toBe(1500);
  });

  it("solo pérdidas: base 0 y ambas quedan pendientes con su año", () => {
    const r = run(-300, -200);
    expect(r.base).toBe(0);
    expect(r.pending).toEqual([
      { originYear: 2025, kind: "gains", amount: 300 },
      { originYear: 2025, kind: "capitalIncome", amount: 200 },
    ]);
  });

  it("compensación exacta al 25 %: pérdida igual al 25 % del positivo", () => {
    const r = run(-250, 1000);
    expect(r.base).toBe(750);
    expect(r.pending).toEqual([]);
    expect(r.compensations).toEqual([
      { source: { kind: "gains", originYear: 2025 }, target: "capitalIncome", amount: 250, cross: true },
    ]);
  });

  it("pérdida mayor que el 25 % del otro grupo: el resto queda pendiente", () => {
    const r = run(1000, -600);
    expect(r.base).toBe(750);
    expect(r.totalCompensated).toBe(250);
    expect(r.pending).toEqual([{ originYear: 2025, kind: "capitalIncome", amount: 350 }]);
  });

  it("el arrastre de hace 4 años aún se aplica y el de hace 5 caduca", () => {
    const r = run(1000, 0, [
      { originYear: 2021, kind: "gains", amount: 100 },
      { originYear: 2020, kind: "gains", amount: 70 },
    ]);
    expect(r.base).toBe(900);
    expect(r.expired).toEqual([{ originYear: 2020, kind: "gains", amount: 70 }]);
  });

  it("el arrastre se aplica primero al mismo grupo, sin límite del 25 %", () => {
    const r = run(1000, 400, [{ originYear: 2024, kind: "gains", amount: 900 }]);
    expect(r.compensations).toEqual([
      { source: { kind: "gains", originYear: 2024 }, target: "gains", amount: 900, cross: false },
    ]);
    expect(r.base).toBe(500);
  });

  it("el remanente del arrastre pasa al otro grupo con el 25 %, compartido con el propio ejercicio", () => {
    // GPP 1000 (positivo), RCM -150 del ejercicio y RCM pendiente 2024 de 400. Tope: 250.
    const r = run(1000, -150, [{ originYear: 2024, kind: "capitalIncome", amount: 400 }]);
    expect(r.compensations.reduce((s, c) => s + c.amount, 0)).toBe(250);
    expect(r.base).toBe(750);
    expect(r.pending).toEqual([{ originYear: 2024, kind: "capitalIncome", amount: 300 }]);
  });

  it("aplica del más antiguo al más reciente", () => {
    const r = run(100, 0, [
      { originYear: 2024, kind: "gains", amount: 60 },
      { originYear: 2022, kind: "gains", amount: 60 },
    ]);
    expect(r.compensations.map((c) => [c.source.originYear, c.amount])).toEqual([
      [2022, 60],
      [2024, 40],
    ]);
    expect(r.pending).toEqual([{ originYear: 2024, kind: "gains", amount: 20 }]);
  });

  it("ignora partidas inválidas (no finitas, ≤ 0, de origen futuro)", () => {
    const r = run(100, 0, [
      { originYear: 2024, kind: "gains", amount: Number.NaN },
      { originYear: 2024, kind: "gains", amount: -5 },
      { originYear: 2026, kind: "gains", amount: 50 },
    ]);
    expect(r.base).toBe(100);
    expect(r.pending).toEqual([]);
  });
});

describe("savingsTax", () => {
  it("base 0: cuota 0 y tipo medio null", () => {
    expect(savingsTax(0)).toEqual({ tax: 0, averageRatePct: null });
  });

  it("aplica la escala del ahorro por tramos", () => {
    const { tax, averageRatePct } = savingsTax(10000);
    expect(tax).toBeCloseTo(6000 * 0.19 + 4000 * 0.21, 9);
    expect(averageRatePct).toBeCloseTo((tax / 10000) * 100, 9);
  });
});
