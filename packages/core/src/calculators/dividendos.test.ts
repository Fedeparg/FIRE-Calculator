import { describe, expect, it } from "vitest";
import { computeDividends } from "./dividendos.js";

describe("computeDividends", () => {
  it("calcula dividendo bruto, retención (19%) y neto", () => {
    const r = computeDividends({ shares: 100, dividendPerShare: 2 });
    expect(r.gross).toBe(200);
    expect(r.withheld).toBeCloseTo(38, 6); // 200 * 0.19
    expect(r.net).toBeCloseTo(162, 6);
  });

  it("calcula la rentabilidad por dividendo si se da el precio", () => {
    const r = computeDividends({ shares: 100, dividendPerShare: 2, sharePrice: 50 });
    expect(r.grossYield).toBeCloseTo(4, 6); // 200 / 5000
    expect(r.netYield).toBeCloseTo(3.24, 6); // 162 / 5000
  });

  it("devuelve yield null sin precio", () => {
    const r = computeDividends({ shares: 100, dividendPerShare: 2 });
    expect(r.grossYield).toBeNull();
    expect(r.netYield).toBeNull();
  });

  it("ignora valores negativos", () => {
    const r = computeDividends({ shares: -10, dividendPerShare: -1 });
    expect(r.gross).toBe(0);
    expect(r.net).toBe(0);
  });

  it("proyecta el flujo neto con crecimiento anual del dividendo", () => {
    const r = computeDividends({ shares: 100, dividendPerShare: 1, annualGrowth: 10, years: 3 });
    // net año 1 = 81 (100*1*0.81); años: 81, 89.1, 98.01 → acumulado 268.11
    expect(r.series).toHaveLength(4); // año 0 + 3 años
    expect(r.finalYearNet).toBeCloseTo(98.01, 6);
    expect(r.cumulativeNet).toBeCloseTo(268.11, 6);
  });

  // Valores por defecto de la calculadora (ver explainer).
  it("golden: defaults 100 acc., 1,50 €, precio 50 €, 19%, +5%/año, 10 años", () => {
    const r = computeDividends({
      shares: 100,
      dividendPerShare: 1.5,
      sharePrice: 50,
      withholdingRate: 19,
      annualGrowth: 5,
      years: 10,
    });
    expect(r.gross).toBe(150);
    expect(r.withheld).toBeCloseTo(28.5, 6);
    expect(r.net).toBeCloseTo(121.5, 6);
    expect(r.grossYield).toBeCloseTo(3, 6);
    expect(r.netYield).toBeCloseTo(2.43, 6);
    expect(r.cumulativeNet).toBeCloseTo(1528.213943069183, 6);
    expect(r.finalYearNet).toBeCloseTo(188.48637824138973, 6);
  });
});
