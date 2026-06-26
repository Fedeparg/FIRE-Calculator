import { describe, expect, it } from "vitest";
import { computeGiftTax } from "./impuesto-donaciones";

describe("computeGiftTax", () => {
  it("valores por defecto del componente (golden)", () => {
    const r = computeGiftTax({ amount: 100000, reduction: 0, kinship: "grupoI_II", regionalRebate: 0 });
    expect(r.taxableBase).toBe(100000);
    expect(r.grossTax).toBeCloseTo(12415.35585, 5);
    expect(r.adjustedTax).toBeCloseTo(12415.35585, 5); // coeficiente Grupo I/II = 1
    expect(r.tax).toBeCloseTo(12415.35585, 5);
    expect(r.effectiveRate).toBeCloseTo(12.41535585, 6);
  });

  it("primer tramo al 7,65%", () => {
    const r = computeGiftTax({ amount: 5000 });
    expect(r.taxableBase).toBe(5000);
    expect(r.grossTax).toBeCloseTo(5000 * 0.0765, 6);
  });

  it("las reducciones bajan la base", () => {
    const r = computeGiftTax({ amount: 50000, reduction: 20000 });
    expect(r.taxableBase).toBe(30000);
  });

  it("el coeficiente de parentesco multiplica la cuota", () => {
    const familia = computeGiftTax({ amount: 100000, kinship: "grupoI_II" });
    const extrano = computeGiftTax({ amount: 100000, kinship: "grupoIV" });
    expect(extrano.adjustedTax).toBeCloseTo(familia.adjustedTax * 2, 4);
  });

  it("la bonificación autonómica reduce la cuota final", () => {
    const sin = computeGiftTax({ amount: 100000 });
    const con = computeGiftTax({ amount: 100000, regionalRebate: 99 });
    expect(con.tax).toBeCloseTo(sin.tax * 0.01, 4);
  });

  it("donación 0 → sin cuota ni división por cero", () => {
    const r = computeGiftTax({ amount: 0 });
    expect(r.tax).toBe(0);
    expect(r.effectiveRate).toBe(0);
  });
});
