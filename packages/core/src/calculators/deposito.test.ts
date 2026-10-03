import { describe, expect, it } from "vitest";
import { MAX_HORIZON_YEARS } from "../inputs.js";
import { computeDeposit } from "./deposito.js";

describe("computeDeposit", () => {
  it("compounds at the TAE (APR) and applies the default 19% withholding", () => {
    const r = computeDeposit({ principal: 10000, apr: 3, years: 1 });
    expect(r.finalGross).toBeCloseTo(10300, 6);
    expect(r.grossInterest).toBeCloseTo(300, 6);
    expect(r.withheld).toBeCloseTo(57, 6); // 300 * 0.19
    expect(r.netInterest).toBeCloseTo(243, 6);
    expect(r.finalNet).toBeCloseTo(10243, 6);
  });

  it("without interest (0% TAE) there is neither withholding nor return", () => {
    const r = computeDeposit({ principal: 5000, apr: 0, years: 5 });
    expect(r.grossInterest).toBeCloseTo(0, 6);
    expect(r.withheld).toBeCloseTo(0, 6);
    expect(r.finalNet).toBeCloseTo(5000, 6);
  });

  it("with zero withholding the net return equals the gross return", () => {
    const r = computeDeposit({ principal: 10000, apr: 4, years: 2, withholdingRate: 0 });
    expect(r.netInterest).toBeCloseTo(r.grossInterest, 6);
  });

  it("supports fractional terms (half a year)", () => {
    const r = computeDeposit({ principal: 10000, apr: 4, years: 0.5, withholdingRate: 0 });
    expect(r.finalGross).toBeCloseTo(10000 * Math.pow(1.04, 0.5), 6);
  });

  it("clamps the withholding to the 0-100% range", () => {
    const r = computeDeposit({ principal: 1000, apr: 10, years: 1, withholdingRate: 150 });
    expect(r.netInterest).toBeCloseTo(0, 6); // withholding clamped to 100%
  });

  it("without inflation, the real value equals the net final value", () => {
    const r = computeDeposit({ principal: 10000, apr: 3, years: 1 });
    expect(r.realFinalNet).toBeCloseTo(r.finalNet, 6);
  });

  it("inflation discounts the purchasing power of the final value", () => {
    const r = computeDeposit({ principal: 10000, apr: 3, years: 1, inflationRate: 2.5 });
    expect(r.realFinalNet).toBeCloseTo(r.finalNet / 1.025, 6); // 10243 / 1.025
    expect(r.realFinalNet).toBeLessThan(10000); // inflation outpaces the net return
  });

  it("with −100% inflation it skips the real-value adjustment instead of returning Infinity", () => {
    const r = computeDeposit({ principal: 10000, apr: 3, years: 2, inflationRate: -100 });
    expect(r.realFinalNet).toBe(r.finalNet);
  });

  it("with a −100% TAE the principal is lost, without NaN", () => {
    const r = computeDeposit({ principal: 10000, apr: -100, years: 0.5 });
    expect(r.finalGross).toBe(0);
  });

  it("accepts fractional terms and clamps absurd ones to MAX_HORIZON_YEARS", () => {
    expect(computeDeposit({ principal: 10000, apr: 4, years: 0.5 }).finalGross).toBeCloseTo(10000 * Math.sqrt(1.04), 6);
    const huge = computeDeposit({ principal: 10000, apr: 4, years: 1e9 });
    expect(huge.finalGross).toBeCloseTo(10000 * Math.pow(1.04, MAX_HORIZON_YEARS), 0);
  });
});
