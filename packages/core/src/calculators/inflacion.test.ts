import { describe, expect, it } from "vitest";
import { computeInflation } from "./inflacion.js";

describe("computeInflation", () => {
  it("calcula el nominal necesario y la pérdida de poder adquisitivo", () => {
    const r = computeInflation({ amount: 1000, annualRate: 3, years: 10 });
    expect(r.nominalNeeded).toBeCloseTo(1000 * Math.pow(1.03, 10), 6);
    expect(r.realValue).toBeCloseTo(1000 / Math.pow(1.03, 10), 6);
    expect(r.lossPercent).toBeCloseTo(((1000 - r.realValue) / 1000) * 100, 6);
  });

  it("con inflación 0 el valor no cambia", () => {
    const r = computeInflation({ amount: 1000, annualRate: 0, years: 20 });
    expect(r.nominalNeeded).toBeCloseTo(1000, 6);
    expect(r.realValue).toBeCloseTo(1000, 6);
    expect(r.lossPercent).toBeCloseTo(0, 6);
  });

  it("genera un punto por año más el año 0", () => {
    const r = computeInflation({ amount: 500, annualRate: 2, years: 15 });
    expect(r.series).toHaveLength(16);
    expect(r.series[0]).toEqual({
      year: 0,
      nominalNeeded: 500,
      realValue: 500,
      realValueInvested: 500,
    });
  });

  it("el poder adquisitivo decrece con inflación positiva", () => {
    const r = computeInflation({ amount: 1000, annualRate: 4, years: 10 });
    for (let k = 1; k < r.series.length; k++) {
      expect(r.series[k].realValue).toBeLessThan(r.series[k - 1].realValue);
    }
  });

  it("sin rentabilidad, el dinero invertido iguala al dinero parado", () => {
    const r = computeInflation({ amount: 1000, annualRate: 3, years: 10 });
    expect(r.realValueInvested).toBeCloseTo(r.realValue, 6);
    expect(r.realReturn).toBeCloseTo((1 / 1.03 - 1) * 100, 6);
  });

  it("invertir por debajo de la inflación mejora pero no conserva el poder (golden, valores por defecto)", () => {
    const r = computeInflation({ amount: 10000, annualRate: 3, years: 20, nominalReturn: 2 });
    expect(Math.round(r.nominalNeeded)).toBe(18061);
    expect(Math.round(r.realValue)).toBe(5537);
    expect(Math.round(r.realValueInvested)).toBe(8227);
    expect(r.lossPercent).toBeCloseTo(44.63, 2);
    expect(r.realReturn).toBeCloseTo(-0.971, 3);
    // El dinero invertido conserva más poder que el parado, pero aún pierde.
    expect(r.realValueInvested).toBeGreaterThan(r.realValue);
    expect(r.realValueInvested).toBeLessThan(10000);
  });

  it("invertir por encima de la inflación da rentabilidad real positiva", () => {
    const r = computeInflation({ amount: 1000, annualRate: 2, years: 30, nominalReturn: 6 });
    expect(r.realReturn).toBeGreaterThan(0);
    expect(r.realValueInvested).toBeGreaterThan(1000);
  });
});
