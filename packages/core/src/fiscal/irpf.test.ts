import { describe, expect, it } from "vitest";
import { PERSONAL_MINIMUM } from "./brackets.js";
import {
  estimateNetSalary,
  generalIncomeTax,
  generalMarginalRate,
  personalAndFamilyMinimum,
  regionalPersonalAndFamilyMinimum,
  workIncomeReduction,
} from "./irpf.js";
import { REGION_CODES } from "./regions.js";

describe("workIncomeReduction", () => {
  it("low earned income → fixed maximum reduction", () => {
    expect(workIncomeReduction(10000)).toBe(7302);
    expect(workIncomeReduction(14852)).toBe(7302);
  });

  it("decreases continuously in the middle band", () => {
    expect(workIncomeReduction(16000)).toBeCloseTo(7302 - 1.75 * (16000 - 14852), 4);
  });

  it("drops to zero above the threshold", () => {
    expect(workIncomeReduction(19747.5)).toBeCloseTo(0, 2);
    expect(workIncomeReduction(25000)).toBe(0);
  });

  it("is never negative", () => {
    expect(workIncomeReduction(19000)).toBeGreaterThanOrEqual(0);
  });
});

describe("generalIncomeTax", () => {
  it("a base equal to the personal allowance (mínimo personal) is not taxed", () => {
    expect(generalIncomeTax(5550)).toBeCloseTo(0, 6);
  });

  it("base below the personal allowance → 0 (never negative)", () => {
    expect(generalIncomeTax(3000)).toBe(0);
  });

  it("grows with the base", () => {
    expect(generalIncomeTax(30000)).toBeGreaterThan(generalIncomeTax(20000));
  });
});

describe("estimateNetSalary", () => {
  it("applies 6.5% SS on the gross", () => {
    const r = estimateNetSalary({ grossAnnual: 30000 });
    expect(r.socialSecurity).toBeCloseTo(1950, 6);
  });

  it("a salary around the minimum wage (SMI) pays almost no IRPF", () => {
    const r = estimateNetSalary({ grossAnnual: 16000 });
    expect(r.incomeTax).toBeLessThan(300);
    expect(r.netAnnual).toBeLessThan(r.grossAnnual);
  });

  it("the net is lower than the gross and the withholding is positive", () => {
    const r = estimateNetSalary({ grossAnnual: 40000 });
    expect(r.netAnnual).toBeLessThan(40000);
    expect(r.withholdingRate).toBeGreaterThan(0);
    expect(r.totalDeductionRate).toBeGreaterThan(r.withholdingRate);
  });

  it("contributing to a pension plan lowers IRPF", () => {
    const withoutPlan = estimateNetSalary({ grossAnnual: 40000 });
    const withPlan = estimateNetSalary({ grossAnnual: 40000, pensionContribution: 1500 });
    expect(withPlan.incomeTax).toBeLessThan(withoutPlan.incomeTax);
  });

  it("splits the net across the given number of payments", () => {
    const r = estimateNetSalary({ grossAnnual: 28000, payments: 12 });
    expect(r.netPerPayment).toBeCloseTo(r.netAnnual / 12, 6);
  });

  // "Golden" values checked by hand against the engine and public references.
  it("GOLDEN: €30,000 single, no children (14 payments)", () => {
    const r = estimateNetSalary({ grossAnnual: 30000, payments: 14 });
    expect(r.socialSecurity).toBeCloseTo(1950, 2);
    expect(r.incomeTax).toBeCloseTo(4926, 0);
    expect(r.netAnnual).toBeCloseTo(23124, 0);
    expect(r.personalMinimum).toBe(5550);
  });

  it("dependent children lower IRPF", () => {
    const withoutChildren = estimateNetSalary({ grossAnnual: 30000 });
    const withChildren = estimateNetSalary({ grossAnnual: 30000, children: 2 });
    expect(withChildren.incomeTax).toBeLessThan(withoutChildren.incomeTax);
    expect(withChildren.personalMinimum).toBeGreaterThan(withoutChildren.personalMinimum);
  });

  it("a temporary contract pays slightly more SS", () => {
    const permanent = estimateNetSalary({ grossAnnual: 30000, contractType: "indefinido" });
    const temporary = estimateNetSalary({ grossAnnual: 30000, contractType: "temporal" });
    expect(temporary.socialSecurity).toBeGreaterThan(permanent.socialSecurity);
  });

  it("a joint return (tributación conjunta) lowers the base and IRPF", () => {
    const individual = estimateNetSalary({ grossAnnual: 30000 });
    const joint = estimateNetSalary({ grossAnnual: 30000, jointReturn: true });
    expect(joint.incomeTax).toBeLessThan(individual.incomeTax);
  });

  it("SS contributions are capped at the maximum contribution base", () => {
    const r = estimateNetSalary({ grossAnnual: 200000 });
    // Maximum base €61,214.40 × 6.5% = €3,978.94, not €13,000.
    expect(r.socialSecurity).toBeCloseTo(61214.4 * 0.065, 2);
  });
});

describe("personalAndFamilyMinimum", () => {
  it("default taxpayer allowance", () => {
    expect(personalAndFamilyMinimum()).toBe(5550);
  });

  it("increases with age", () => {
    expect(personalAndFamilyMinimum({ age: 70 })).toBe(6700);
    expect(personalAndFamilyMinimum({ age: 80 })).toBe(8100);
  });

  it("accumulates the descendants allowance in order", () => {
    // 5,550 + 2,400 (1st) + 2,700 (2nd) = 10,650
    expect(personalAndFamilyMinimum({ children: 2 })).toBe(10650);
  });

  it("adds €2,800 for each child under 3", () => {
    expect(personalAndFamilyMinimum({ children: 1, childrenUnder3: 1 })).toBe(5550 + 2400 + 2800);
  });

  it("adds ascendants and disability", () => {
    expect(personalAndFamilyMinimum({ ascendants: 1 })).toBe(5550 + 1150);
    expect(personalAndFamilyMinimum({ disability: "g65" })).toBe(5550 + 9000);
  });
});

describe("IRPF by autonomous community (comunidad autónoma)", () => {
  const BASES = [0, 5550, 12450, 20000, 30000, 60000, 100000, 300000, 500000];

  it("without a region the result is exactly the legacy one (combined scale)", () => {
    for (const base of BASES) {
      const legacy = generalIncomeTax(base);
      expect(generalIncomeTax(base, PERSONAL_MINIMUM, {})).toBe(legacy);
      expect(generalIncomeTax(base, PERSONAL_MINIMUM, { region: undefined })).toBe(legacy);
      // A different regional allowance is irrelevant as long as there is no region.
      expect(generalIncomeTax(base, PERSONAL_MINIMUM, { regionalMinimum: 9999 })).toBe(legacy);
    }
  });

  it("Castilla-La Mancha gives the same result as no region", () => {
    // Its regional scale is identical to the fallback (supletoria) one and it does not change the
    // allowance: this checks that adding state + regional introduces no bias.
    for (const base of BASES) {
      expect(generalIncomeTax(base, PERSONAL_MINIMUM, { region: "castilla-la-mancha" })).toBeCloseTo(
        generalIncomeTax(base),
        6,
      );
    }
  });

  it.each(REGION_CODES)("%s: tax is positive, increasing and never above 47% of the base", (region) => {
    const options = { region, regionalMinimum: regionalPersonalAndFamilyMinimum({ region }) };
    expect(generalIncomeTax(0, PERSONAL_MINIMUM, options)).toBe(0);
    expect(generalIncomeTax(40000, PERSONAL_MINIMUM, options)).toBeGreaterThan(
      generalIncomeTax(30000, PERSONAL_MINIMUM, options),
    );
    expect(generalIncomeTax(60000, PERSONAL_MINIMUM, options)).toBeLessThan(60000 * 0.47);
  });

  it("each tax amount (cuota) is floored at zero separately, not their sum", () => {
    // Asturias raises the taxpayer allowance to €6,105. With a base of
    // €6,000 there is state tax (above €5,550) and NO regional
    // tax: €450 at the 9.5% state rate = €42.75. Flooring the sum instead of
    // each amount would give €33.30, subtracting a negative regional amount.
    const options = {
      region: "asturias" as const,
      regionalMinimum: regionalPersonalAndFamilyMinimum({ region: "asturias" }),
    };
    expect(regionalPersonalAndFamilyMinimum({ region: "asturias" })).toBe(6105);
    expect(generalIncomeTax(6000, PERSONAL_MINIMUM, options)).toBeCloseTo(42.75, 6);
  });

  it("Madrid pays less than the fallback scale and the Comunitat Valenciana pays more", () => {
    const withRegion = (region: "madrid" | "valencia") =>
      generalIncomeTax(100000, PERSONAL_MINIMUM, {
        region,
        regionalMinimum: regionalPersonalAndFamilyMinimum({ region }),
      });
    expect(withRegion("madrid")).toBeLessThan(generalIncomeTax(100000));
    expect(withRegion("valencia")).toBeGreaterThan(generalIncomeTax(100000));
  });

  it("zero or non-finite bases do not break the calculation with a region", () => {
    for (const region of REGION_CODES) {
      const options = { region, regionalMinimum: regionalPersonalAndFamilyMinimum({ region }) };
      expect(generalIncomeTax(0, PERSONAL_MINIMUM, options)).toBe(0);
      expect(generalIncomeTax(-1000, PERSONAL_MINIMUM, options)).toBe(0);
      expect(generalIncomeTax(Number.NaN, PERSONAL_MINIMUM, options)).toBe(0);
      expect(generalIncomeTax(Number.POSITIVE_INFINITY, PERSONAL_MINIMUM, options)).toBe(0);
      expect(generalIncomeTax(30000, Number.NaN, options)).toBeGreaterThan(0);
    }
  });

  it("the regional allowance only feeds the regional tax", () => {
    // Canarias lowers the marginal rate of the first brackets and raises the allowance: with the
    // same base, its tax differs from the one obtained using the state allowance in
    // both scales.
    const base = 30000;
    const withOwnMinimum = generalIncomeTax(base, PERSONAL_MINIMUM, {
      region: "canarias",
      regionalMinimum: regionalPersonalAndFamilyMinimum({ region: "canarias" }),
    });
    const withStateMinimum = generalIncomeTax(base, PERSONAL_MINIMUM, { region: "canarias" });
    expect(regionalPersonalAndFamilyMinimum({ region: "canarias" })).toBe(5606);
    expect(withOwnMinimum).toBeLessThan(withStateMinimum);
  });

  it("family circumstances also apply to the regional allowance", () => {
    const c = { region: "galicia" as const, children: 2, childrenUnder3: 1 };
    // 5,789 + 2,503 + 2,816 + 2,920 (under 3) = €14,028.
    expect(regionalPersonalAndFamilyMinimum(c)).toBeCloseTo(14028, 6);
    // The same taxpayer's state allowance is still the state one.
    expect(personalAndFamilyMinimum(c)).toBeCloseTo(5550 + 2400 + 2700 + 2800, 6);
  });

  it("without a region, the regional allowance is the state one", () => {
    const c = { children: 1, age: 70 };
    expect(regionalPersonalAndFamilyMinimum(c)).toBe(personalAndFamilyMinimum(c));
    expect(regionalPersonalAndFamilyMinimum()).toBe(personalAndFamilyMinimum());
  });
});

describe("generalMarginalRate", () => {
  it("without a region returns the marginal rate of the combined scale", () => {
    expect(generalMarginalRate(30000)).toBe(30);
    expect(generalMarginalRate(400000)).toBe(47);
  });

  it("with a region adds the state and regional marginal rates", () => {
    // Madrid: 17.40% regional + 18.50% state in the €35,200-57,320 bracket.
    expect(generalMarginalRate(40000, "madrid")).toBeCloseTo(35.9, 6);
    // La Rioja above €120,000: 27% + 22.50% state.
    expect(generalMarginalRate(150000, "la-rioja")).toBeCloseTo(49.5, 6);
  });

  it("non-finite or negative bases use the first bracket", () => {
    expect(generalMarginalRate(Number.NaN, "madrid")).toBeCloseTo(9.5 + 8.5, 6);
    expect(generalMarginalRate(-5000)).toBe(19);
  });
});

describe("estimateNetSalary by region", () => {
  it("without a region the result is unchanged from the legacy one", () => {
    const withoutRegion = estimateNetSalary({ grossAnnual: 30000 });
    const explicitUndefined = estimateNetSalary({ grossAnnual: 30000, region: undefined });
    expect(explicitUndefined).toEqual(withoutRegion);
  });

  it("the region moves the net in the expected direction", () => {
    const base = { grossAnnual: 60000 };
    const inMadrid = estimateNetSalary({ ...base, region: "madrid" });
    const fallback = estimateNetSalary(base);
    const inValencia = estimateNetSalary({ ...base, region: "valencia" });
    expect(inMadrid.netAnnual).toBeGreaterThan(fallback.netAnnual);
    expect(inValencia.netAnnual).toBeLessThan(fallback.netAnnual);
    // The reported allowance is still the state one.
    expect(inMadrid.personalMinimum).toBe(fallback.personalMinimum);
  });
});
