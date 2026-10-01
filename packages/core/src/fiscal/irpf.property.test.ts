import fc from "fast-check";
import { describe, it } from "vitest";

import { PROPERTY_PARAMS } from "../property-config.js";
import { estimateNetSalary, generalIncomeTax, generalMarginalRate, type NetSalaryInput } from "./irpf.js";
import { REGION_CODES, type RegionCode } from "./regions.js";

/** Una comunidad de régimen común, o ninguna (escala supletoria). */
const region: fc.Arbitrary<RegionCode | undefined> = fc.option(fc.constantFrom(...REGION_CODES), {
  nil: undefined,
});

const base = fc.double({ min: 0, max: 500_000, noNaN: true });

const circumstances = fc.record({
  grossAnnual: fc.double({ min: 0, max: 400_000, noNaN: true }),
  payments: fc.constantFrom(12, 14),
  age: fc.integer({ min: 18, max: 90 }),
  contractType: fc.constantFrom("indefinido" as const, "temporal" as const),
  children: fc.integer({ min: 0, max: 5 }),
  ascendants: fc.integer({ min: 0, max: 2 }),
  jointReturn: fc.boolean(),
  region,
});

describe("IRPF — propiedades", () => {
  it("la cuota nunca baja al subir la base, en todas las comunidades", () => {
    fc.assert(
      fc.property(base, fc.double({ min: 0, max: 50_000, noNaN: true }), region, (b, extra, r) => {
        const options = { region: r };
        return generalIncomeTax(b + extra, undefined, options) >= generalIncomeTax(b, undefined, options) - 1e-9;
      }),
      PROPERTY_PARAMS,
    );
  });

  it("la cuota nunca supera la base ni es negativa", () => {
    fc.assert(
      fc.property(base, region, (b, r) => {
        const tax = generalIncomeTax(b, undefined, { region: r });
        return tax >= 0 && tax <= b;
      }),
      PROPERTY_PARAMS,
    );
  });

  it("el tipo marginal está entre 0 y 100 %", () => {
    fc.assert(
      fc.property(base, region, (b, r) => {
        const rate = generalMarginalRate(b, r);
        return rate >= 0 && rate <= 100;
      }),
      PROPERTY_PARAMS,
    );
  });

  it("el neto nunca supera al bruto y las cifras son finitas", () => {
    fc.assert(
      fc.property(circumstances, (input) => {
        const r = estimateNetSalary(input satisfies NetSalaryInput);
        return (
          r.netAnnual <= r.grossAnnual &&
          r.incomeTax >= 0 &&
          r.socialSecurity >= 0 &&
          [r.netAnnual, r.netPerPayment, r.withholdingRate, r.totalDeductionRate].every(Number.isFinite)
        );
      }),
      PROPERTY_PARAMS,
    );
  });

  it("cobrar más bruto nunca deja menos neto", () => {
    fc.assert(
      fc.property(circumstances, fc.double({ min: 1, max: 20_000, noNaN: true }), (input, raise) => {
        const before = estimateNetSalary(input).netAnnual;
        const after = estimateNetSalary({ ...input, grossAnnual: input.grossAnnual + raise }).netAnnual;
        return after >= before - 1e-6;
      }),
      PROPERTY_PARAMS,
    );
  });
});
