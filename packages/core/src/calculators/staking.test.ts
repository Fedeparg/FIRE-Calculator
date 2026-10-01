import { describe, expect, it } from "vitest";
import { computeStaking } from "./staking.js";

describe("computeStaking", () => {
  it("capitaliza al APY de forma compuesta anual", () => {
    const r = computeStaking({ principal: 1000, apy: 10, years: 3 });
    expect(r.finalValue).toBeCloseTo(1331, 6); // 1000 * 1.1^3
    expect(r.rewards).toBeCloseTo(331, 6);
  });

  it("sin APY no genera recompensas", () => {
    const r = computeStaking({ principal: 5000, apy: 0, years: 10 });
    expect(r.rewards).toBeCloseTo(0, 6);
    expect(r.finalValue).toBeCloseTo(5000, 6);
  });

  it("expone la serie (un punto por año más el año 0)", () => {
    const r = computeStaking({ principal: 1000, apy: 8, years: 5 });
    expect(r.series).toHaveLength(6);
    expect(r.rewards).toBeCloseTo(r.totalInterest, 6);
  });

  // Valores por defecto de la calculadora (ver explainer).
  it("golden: defaults 5.000 € al 8% APY durante 5 años con retención 19%", () => {
    const r = computeStaking({ principal: 5000, apy: 8, years: 5, withholdingRate: 19 });
    expect(r.finalValue).toBeCloseTo(7346.640384000002, 6);
    expect(r.rewards).toBeCloseTo(2346.640384000002, 6);
    expect(r.withheld).toBeCloseTo(445.8616729600004, 6);
    expect(r.netRewards).toBeCloseTo(1900.7787110400018, 6);
    expect(r.netFinalValue).toBeCloseTo(6900.778711040002, 6);
  });
});
