import { describe, expect, it } from "vitest";
import { computeRoi } from "./roi.js";

describe("computeRoi", () => {
  it("calcula ganancia y ROI total", () => {
    const r = computeRoi({ initial: 1000, final: 1500 });
    expect(r.gain).toBe(500);
    expect(r.roi).toBeCloseTo(50, 6);
    expect(r.annualized).toBeNull();
  });

  it("anualiza (CAGR) cuando se indica el horizonte", () => {
    const r = computeRoi({ initial: 1000, final: 1500, years: 2 });
    expect(r.annualized).toBeCloseTo((Math.sqrt(1.5) - 1) * 100, 6);
  });

  it("refleja pérdidas con valores negativos", () => {
    const r = computeRoi({ initial: 1000, final: 800 });
    expect(r.gain).toBe(-200);
    expect(r.roi).toBeCloseTo(-20, 6);
  });

  it("evita dividir por cero con inversión inicial 0", () => {
    const r = computeRoi({ initial: 0, final: 500 });
    expect(r.roi).toBe(0);
    expect(r.annualized).toBeNull();
  });

  it("no aplica impuesto cuando hay pérdida", () => {
    const r = computeRoi({ initial: 1000, final: 800, taxRate: 19 });
    expect(r.tax).toBe(0);
    expect(r.netGain).toBe(-200);
  });

  // Valores por defecto de la calculadora (ver explainer).
  it("golden: defaults 1.000→1.500, 5 años, 20 € costes, 50 € rentas, 19%", () => {
    const r = computeRoi({ initial: 1000, final: 1500, years: 5, costs: 20, income: 50, taxRate: 19 });
    expect(r.invested).toBe(1020);
    expect(r.gain).toBe(530);
    expect(r.roi).toBeCloseTo(51.9607843137255, 6);
    expect(r.annualized).toBeCloseTo(8.729228205170436, 6);
    expect(r.tax).toBeCloseTo(100.7, 6);
    expect(r.netGain).toBeCloseTo(429.3, 6);
    expect(r.netRoi).toBeCloseTo(42.08823529411765, 6);
  });

  it("un plazo minúsculo que desborda la anualización la deja sin respuesta", () => {
    const r = computeRoi({ initial: 1000, final: 1500, years: 1e-300 });
    expect(r.annualized).toBeNull();
  });
});
