import { describe, expect, it } from "vitest";

import { computeSavingsBase, type PendingNegative } from "./savings-base.js";

const run = (gainsBalance: number, capitalIncomeBalance: number, pending: PendingNegative[] = [], year = 2025) =>
  computeSavingsBase({ year, gainsBalance, capitalIncomeBalance, pending });

describe("computeSavingsBase", () => {
  it("empty tax year: base 0 and nothing pending", () => {
    const r = run(0, 0);
    expect(r).toMatchObject({ base: 0, compensations: [], pending: [], expired: [], totalCompensated: 0 });
  });

  it("no negatives: the base is the sum of the balances", () => {
    expect(run(1000, 500).base).toBe(1500);
  });

  it("losses only: base 0 and both stay pending with their year", () => {
    const r = run(-300, -200);
    expect(r.base).toBe(0);
    expect(r.pending).toEqual([
      { originYear: 2025, kind: "gains", amount: 300 },
      { originYear: 2025, kind: "capitalIncome", amount: 200 },
    ]);
  });

  it("exact 25% offset: a loss equal to 25% of the positive balance", () => {
    const r = run(-250, 1000);
    expect(r.base).toBe(750);
    expect(r.pending).toEqual([]);
    expect(r.compensations).toEqual([
      { source: { kind: "gains", originYear: 2025 }, target: "capitalIncome", amount: 250, cross: true },
    ]);
  });

  it("a loss above 25% of the other group: the rest stays pending", () => {
    const r = run(1000, -600);
    expect(r.base).toBe(750);
    expect(r.totalCompensated).toBe(250);
    expect(r.pending).toEqual([{ originYear: 2025, kind: "capitalIncome", amount: 350 }]);
  });

  it("a carryforward from 4 years ago still applies and one from 5 years ago expires", () => {
    const r = run(1000, 0, [
      { originYear: 2021, kind: "gains", amount: 100 },
      { originYear: 2020, kind: "gains", amount: 70 },
    ]);
    expect(r.base).toBe(900);
    expect(r.expired).toEqual([{ originYear: 2020, kind: "gains", amount: 70 }]);
  });

  it("the carryforward applies to the same group first, with no 25% cap", () => {
    const r = run(1000, 400, [{ originYear: 2024, kind: "gains", amount: 900 }]);
    expect(r.compensations).toEqual([
      { source: { kind: "gains", originYear: 2024 }, target: "gains", amount: 900, cross: false },
    ]);
    expect(r.base).toBe(500);
  });

  it("the carryforward remainder crosses to the other group under the 25% cap, shared with the current year", () => {
    // Capital gains (GPP) 1000 (positive), capital income (RCM) -150 for the year and a pending 2024 RCM of
    // 400. Cap: 250.
    const r = run(1000, -150, [{ originYear: 2024, kind: "capitalIncome", amount: 400 }]);
    expect(r.compensations.reduce((s, c) => s + c.amount, 0)).toBe(250);
    expect(r.base).toBe(750);
    expect(r.pending).toEqual([{ originYear: 2024, kind: "capitalIncome", amount: 300 }]);
  });

  it("applies from oldest to newest", () => {
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

  it("ignores invalid items (non-finite, ≤ 0, originating in the future)", () => {
    const r = run(100, 0, [
      { originYear: 2024, kind: "gains", amount: Number.NaN },
      { originYear: 2024, kind: "gains", amount: -5 },
      { originYear: 2026, kind: "gains", amount: 50 },
    ]);
    expect(r.base).toBe(100);
    expect(r.pending).toEqual([]);
  });
});

describe("computeSavingsBase: Manual cases", () => {
  it("reproduces the worked example of the AEAT's Manual de Renta 2025 (ch. 12): savings base (base del ahorro) 200", () => {
    // https://sede.agenciatributaria.gob.es/Sede/ayuda/manuales-videos-folletos/manuales-practicos/irpf-2025/c12-integracion-compensacion-rentas/caso-practico.html
    const r = computeSavingsBase({
      year: 2025,
      gainsBalance: 5600 - 1600,
      capitalIncomeBalance: -800,
      pending: [
        { originYear: 2021, kind: "gains", amount: 700 },
        { originYear: 2021, kind: "capitalIncome", amount: 500 },
        { originYear: 2022, kind: "gains", amount: 2100 },
      ],
    });
    expect(r.base).toBeCloseTo(200, 10);
    expect(r.totalCompensated).toBeCloseTo(3800, 10);
    expect(r.pending).toEqual([{ originYear: 2021, kind: "capitalIncome", amount: 300 }]);
  });

  it("applies every pending item against its own group before crossing any (the Manual's order)", () => {
    const r = computeSavingsBase({
      year: 2025,
      gainsBalance: 1000,
      capitalIncomeBalance: 0,
      pending: [
        { originYear: 2021, kind: "capitalIncome", amount: 500 },
        { originYear: 2022, kind: "gains", amount: 1000 },
      ],
    });
    // The 2022 loss absorbs the gain first; the 2021 RCM has nothing left to cross against.
    expect(r.base).toBe(0);
    expect(r.pending).toEqual([{ originYear: 2021, kind: "capitalIncome", amount: 500 }]);
  });
});
