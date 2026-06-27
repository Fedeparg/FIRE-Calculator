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

  it("la contribución de empresa NO genera ahorro de IRPF directo", () => {
    const sin = computePensionRelief({ grossAnnual: 60000, contribution: 1500 });
    const con = computePensionRelief({ grossAnnual: 60000, contribution: 1500, employerContribution: 8500 });
    expect(con.taxSaving).toBe(sin.taxSaving); // el ahorro depende solo de la aportación individual
    expect(con.netCost).toBe(sin.netCost);
  });

  it("la contribución de empresa se limita a 8.500 € y al conjunto de 10.000 €", () => {
    const r = computePensionRelief({ grossAnnual: 60000, contribution: 1500, employerContribution: 12000 });
    expect(r.appliedContribution).toBe(1500);
    expect(r.employerApplied).toBe(8500); // tope de empresa
    expect(r.totalApplied).toBe(10000); // límite conjunto
  });

  it("el conjunto individual + empresa no supera 10.000 €", () => {
    const r = computePensionRelief({ grossAnnual: 60000, contribution: 1500, employerContribution: 9000 });
    expect(r.totalApplied).toBeLessThanOrEqual(10000);
    expect(r.employerApplied).toBe(8500);
  });
});
