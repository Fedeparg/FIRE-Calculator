import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { PROPERTY_PARAMS } from "./property-config.js";
import { FREQUENCIES, project, type ProjectionInput } from "./projection.js";

/** Entradas "normales": importes y tasas no negativos, horizonte razonable. */
const input = fc.record({
  initial: fc.double({ min: 0, max: 1e6, noNaN: true }),
  contribution: fc.double({ min: 0, max: 1e4, noNaN: true }),
  frequency: fc.constantFrom(...FREQUENCIES),
  annualRate: fc.double({ min: 0, max: 20, noNaN: true }),
  years: fc.integer({ min: 0, max: 50 }),
  contributionGrowth: fc.double({ min: 0, max: 10, noNaN: true }),
}) satisfies fc.Arbitrary<ProjectionInput>;

/** Tolerancia relativa para comparar sumas en coma flotante. */
const close = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

describe("project — propiedades", () => {
  it("un año más nunca reduce el valor final con rentabilidad y aportación no negativas", () => {
    fc.assert(
      fc.property(input, (i) => {
        const now = project(i).finalValue;
        const later = project({ ...i, years: i.years + 1 }).finalValue;
        return later >= now || close(later, now);
      }),
      PROPERTY_PARAMS,
    );
  });

  it("más aportación o más rentabilidad nunca reducen el valor final", () => {
    fc.assert(
      fc.property(input, fc.double({ min: 0, max: 1000, noNaN: true }), (i, extra) => {
        const base = project(i).finalValue;
        const moreContribution = project({ ...i, contribution: i.contribution + extra }).finalValue;
        const moreRate = project({ ...i, annualRate: i.annualRate + extra / 100 }).finalValue;
        return (moreContribution >= base || close(moreContribution, base)) && (moreRate >= base || close(moreRate, base));
      }),
      PROPERTY_PARAMS,
    );
  });

  it("con rentabilidad 0 el valor es exactamente lo aportado, sin intereses", () => {
    fc.assert(
      fc.property(input, (i) => {
        const result = project({ ...i, annualRate: 0 });
        return result.series.every((p) => close(p.value, p.contributed) && close(p.interest, 0));
      }),
      PROPERTY_PARAMS,
    );
  });

  it("valor = aportado + intereses en cada año, y nunca por debajo de lo aportado", () => {
    fc.assert(
      fc.property(input, (i) => {
        const result = project(i);
        return result.series.every(
          (p) => close(p.value, p.contributed + p.interest) && (p.value >= p.contributed || close(p.value, p.contributed)),
        );
      }),
      PROPERTY_PARAMS,
    );
  });

  it("la serie tiene un punto por año, del 0 al horizonte", () => {
    fc.assert(
      fc.property(input, (i) => {
        const result = project(i);
        expect(result.series.map((p) => p.year)).toEqual(Array.from({ length: i.years + 1 }, (_, y) => y));
      }),
      PROPERTY_PARAMS,
    );
  });
});
