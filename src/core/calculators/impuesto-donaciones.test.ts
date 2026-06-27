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

  it("expone el coeficiente multiplicador aplicado", () => {
    expect(computeGiftTax({ amount: 100000, kinship: "grupoI_II" }).coefficient).toBe(1.0);
    expect(computeGiftTax({ amount: 100000, kinship: "grupoIII" }).coefficient).toBe(1.5882);
    expect(computeGiftTax({ amount: 100000, kinship: "grupoIV" }).coefficient).toBe(2.0);
  });

  it("el patrimonio preexistente eleva el coeficiente por tramos (art. 22.2)", () => {
    const base = computeGiftTax({ amount: 100000, kinship: "grupoI_II" });
    // Tramo 2 (> 402.678,11 €): coeficiente 1,05.
    const tramo2 = computeGiftTax({ amount: 100000, kinship: "grupoI_II", preexistingWealth: 1_000_000 });
    expect(tramo2.coefficient).toBe(1.05);
    expect(tramo2.adjustedTax).toBeCloseTo(base.grossTax * 1.05, 6);
    // Tramo 4 (> 4.020.770,98 €): coeficiente 1,20.
    const tramo4 = computeGiftTax({ amount: 100000, kinship: "grupoI_II", preexistingWealth: 5_000_000 });
    expect(tramo4.coefficient).toBe(1.2);
  });

  it("el límite superior de un tramo pertenece a ese tramo", () => {
    const r = computeGiftTax({ amount: 100000, kinship: "grupoI_II", preexistingWealth: 402678.11 });
    expect(r.coefficient).toBe(1.0); // exactamente en el límite → primer tramo
  });
});
