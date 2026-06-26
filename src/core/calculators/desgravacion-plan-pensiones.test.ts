import { describe, expect, it } from "vitest";
import { computePensionRelief } from "./desgravacion-plan-pensiones";

describe("computePensionRelief", () => {
  it("valores por defecto del componente (golden)", () => {
    const r = computePensionRelief({ grossAnnual: 40000, contribution: 1500 });
    expect(r.appliedContribution).toBe(1500);
    expect(r.excess).toBe(0);
    expect(r.taxSaving).toBe(464); // 1500 € en el tramo marginal del 30 % + autonómico
    expect(r.netCost).toBe(1036);
    expect(r.savingRate).toBeCloseTo(30.933333333, 6);
  });

  it("limita la aportación al máximo legal de 1.500 €", () => {
    const r = computePensionRelief({ grossAnnual: 40000, contribution: 3000 });
    expect(r.appliedContribution).toBe(1500);
    expect(r.excess).toBe(1500);
  });

  it("a mayor tramo marginal, mayor ahorro fiscal", () => {
    const bajo = computePensionRelief({ grossAnnual: 20000, contribution: 1500 });
    const alto = computePensionRelief({ grossAnnual: 60000, contribution: 1500 });
    expect(alto.taxSaving).toBeGreaterThan(bajo.taxSaving);
  });

  it("el coste neto es la aportación menos el ahorro", () => {
    const r = computePensionRelief({ grossAnnual: 40000, contribution: 1500 });
    expect(r.netCost).toBeCloseTo(r.appliedContribution - r.taxSaving, 6);
    expect(r.savingRate).toBeGreaterThan(0);
  });

  it("sin aportación, ahorro 0 (sin dividir por cero)", () => {
    const r = computePensionRelief({ grossAnnual: 40000, contribution: 0 });
    expect(r.taxSaving).toBe(0);
    expect(r.savingRate).toBe(0);
  });
});
