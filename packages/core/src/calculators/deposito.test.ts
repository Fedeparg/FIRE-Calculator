import { describe, expect, it } from "vitest";
import { computeDeposit } from "./deposito.js";

describe("computeDeposit", () => {
  it("capitaliza a la TAE y aplica la retención del 19 % por defecto", () => {
    const r = computeDeposit({ principal: 10000, apr: 3, years: 1 });
    expect(r.finalGross).toBeCloseTo(10300, 6);
    expect(r.grossInterest).toBeCloseTo(300, 6);
    expect(r.withheld).toBeCloseTo(57, 6); // 300 * 0.19
    expect(r.netInterest).toBeCloseTo(243, 6);
    expect(r.finalNet).toBeCloseTo(10243, 6);
  });

  it("sin interés (0 % TAE) no genera ni retención ni rendimiento", () => {
    const r = computeDeposit({ principal: 5000, apr: 0, years: 5 });
    expect(r.grossInterest).toBeCloseTo(0, 6);
    expect(r.withheld).toBeCloseTo(0, 6);
    expect(r.finalNet).toBeCloseTo(5000, 6);
  });

  it("con retención 0 el rendimiento neto iguala al bruto", () => {
    const r = computeDeposit({ principal: 10000, apr: 4, years: 2, withholdingRate: 0 });
    expect(r.netInterest).toBeCloseTo(r.grossInterest, 6);
  });

  it("admite plazos fraccionarios (medio año)", () => {
    const r = computeDeposit({ principal: 10000, apr: 4, years: 0.5, withholdingRate: 0 });
    expect(r.finalGross).toBeCloseTo(10000 * Math.pow(1.04, 0.5), 6);
  });

  it("acota la retención al rango 0-100 %", () => {
    const r = computeDeposit({ principal: 1000, apr: 10, years: 1, withholdingRate: 150 });
    expect(r.netInterest).toBeCloseTo(0, 6); // retención acotada al 100 %
  });

  it("sin inflación, el valor real iguala al valor final neto", () => {
    const r = computeDeposit({ principal: 10000, apr: 3, years: 1 });
    expect(r.realFinalNet).toBeCloseTo(r.finalNet, 6);
  });

  it("la inflación descuenta el poder adquisitivo del valor final", () => {
    const r = computeDeposit({ principal: 10000, apr: 3, years: 1, inflationRate: 2.5 });
    expect(r.realFinalNet).toBeCloseTo(r.finalNet / 1.025, 6); // 10243 / 1,025
    expect(r.realFinalNet).toBeLessThan(10000); // la inflación supera al neto
  });
});
