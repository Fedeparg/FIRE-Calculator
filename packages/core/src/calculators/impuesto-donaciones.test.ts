import { describe, expect, it } from "vitest";
import { computeGiftTax } from "./impuesto-donaciones.js";

describe("computeGiftTax", () => {
  it("component defaults (golden)", () => {
    const r = computeGiftTax({ amount: 100000, reduction: 0, kinship: "grupoI_II", regionalRebate: 0 });
    expect(r.taxableBase).toBe(100000);
    expect(r.grossTax).toBeCloseTo(12415.35585, 5);
    expect(r.adjustedTax).toBeCloseTo(12415.35585, 5); // Group I/II coefficient = 1
    expect(r.tax).toBeCloseTo(12415.35585, 5);
    expect(r.effectiveRate).toBeCloseTo(12.41535585, 6);
  });

  it("first bracket at 7.65%", () => {
    const r = computeGiftTax({ amount: 5000 });
    expect(r.taxableBase).toBe(5000);
    expect(r.grossTax).toBeCloseTo(5000 * 0.0765, 6);
  });

  it("reductions lower the base", () => {
    const r = computeGiftTax({ amount: 50000, reduction: 20000 });
    expect(r.taxableBase).toBe(30000);
  });

  it("the kinship coefficient multiplies the tax", () => {
    const closeFamily = computeGiftTax({ amount: 100000, kinship: "grupoI_II" });
    const stranger = computeGiftTax({ amount: 100000, kinship: "grupoIV" });
    expect(stranger.adjustedTax).toBeCloseTo(closeFamily.adjustedTax * 2, 4);
  });

  it("the regional rebate reduces the final tax", () => {
    const withoutRebate = computeGiftTax({ amount: 100000 });
    const withRebate = computeGiftTax({ amount: 100000, regionalRebate: 99 });
    expect(withRebate.tax).toBeCloseTo(withoutRebate.tax * 0.01, 4);
  });

  it("zero gift → no tax and no division by zero", () => {
    const r = computeGiftTax({ amount: 0 });
    expect(r.tax).toBe(0);
    expect(r.effectiveRate).toBe(0);
  });

  it("exposes the applied multiplier coefficient", () => {
    expect(computeGiftTax({ amount: 100000, kinship: "grupoI_II" }).coefficient).toBe(1.0);
    expect(computeGiftTax({ amount: 100000, kinship: "grupoIII" }).coefficient).toBe(1.5882);
    expect(computeGiftTax({ amount: 100000, kinship: "grupoIV" }).coefficient).toBe(2.0);
  });

  it("pre-existing wealth raises the coefficient by bracket (art. 22.2)", () => {
    const base = computeGiftTax({ amount: 100000, kinship: "grupoI_II" });
    // Bracket 2 (> €402,678.11): coefficient 1.05.
    const secondBracket = computeGiftTax({ amount: 100000, kinship: "grupoI_II", preexistingWealth: 1_000_000 });
    expect(secondBracket.coefficient).toBe(1.05);
    expect(secondBracket.adjustedTax).toBeCloseTo(base.grossTax * 1.05, 6);
    // Bracket 4 (> €4,020,770.98): coefficient 1.20.
    const fourthBracket = computeGiftTax({ amount: 100000, kinship: "grupoI_II", preexistingWealth: 5_000_000 });
    expect(fourthBracket.coefficient).toBe(1.2);
  });

  it("the upper limit of a bracket belongs to that bracket", () => {
    const r = computeGiftTax({ amount: 100000, kinship: "grupoI_II", preexistingWealth: 402678.11 });
    expect(r.coefficient).toBe(1.0); // exactly at the limit → first bracket
  });
});
