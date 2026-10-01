import { describe, expect, it } from "vitest";
import { computeSimpleInterest } from "./interes-simple.js";

describe("computeSimpleInterest", () => {
  it("calcula el interés siempre sobre el capital inicial", () => {
    const r = computeSimpleInterest({ principal: 1000, annualRate: 5, years: 10 });
    expect(r.totalInterest).toBeCloseTo(500, 6); // 1000 * 0.05 * 10
    expect(r.finalValue).toBeCloseTo(1500, 6);
  });

  it("genera un punto por año más el año 0 y crece de forma lineal", () => {
    const r = computeSimpleInterest({ principal: 1000, annualRate: 10, years: 3 });
    expect(r.series).toHaveLength(4);
    expect(r.series.map((p) => p.value)).toEqual([1000, 1100, 1200, 1300]);
  });

  it("con horizonte 0 devuelve el capital inicial sin intereses", () => {
    const r = computeSimpleInterest({ principal: 2500, annualRate: 8, years: 0 });
    expect(r.finalValue).toBe(2500);
    expect(r.totalInterest).toBe(0);
    expect(r.series).toHaveLength(1);
  });

  it("trata el capital negativo como cero", () => {
    const r = computeSimpleInterest({ principal: -1000, annualRate: 5, years: 10 });
    expect(r.finalValue).toBe(0);
  });

  it("aplica la retención por defecto (19%) sobre los intereses", () => {
    const r = computeSimpleInterest({ principal: 1000, annualRate: 5, years: 10 });
    expect(r.withheld).toBeCloseTo(95, 6); // 500 * 0.19
    expect(r.netInterest).toBeCloseTo(405, 6);
    expect(r.netFinalValue).toBeCloseTo(1405, 6);
  });

  // Valores por defecto de la calculadora (ver explainer).
  it("golden: defaults 10.000 € al 4% durante 15 años con retención 19%", () => {
    const r = computeSimpleInterest({ principal: 10000, annualRate: 4, years: 15, withholdingRate: 19 });
    expect(r.finalValue).toBe(16000);
    expect(r.totalInterest).toBe(6000);
    expect(r.withheld).toBeCloseTo(1140, 6);
    expect(r.netInterest).toBeCloseTo(4860, 6);
    expect(r.netFinalValue).toBeCloseTo(14860, 6);
  });
});
