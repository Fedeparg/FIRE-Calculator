import { describe, expect, it } from "vitest";
import { COMPOUNDING_FREQUENCIES, FREQUENCIES, PERIODS_PER_YEAR, project } from "./projection.js";
import { itemAt } from "./arrays.js";

const relClose = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

describe("project (motor genérico)", () => {
  it("aporta el número correcto de veces por año según la frecuencia", () => {
    for (const [freq, ppy] of Object.entries(PERIODS_PER_YEAR)) {
      const r = project({
        initial: 0,
        contribution: 10,
        frequency: freq as keyof typeof PERIODS_PER_YEAR,
        annualRate: 0,
        years: 1,
      });
      expect(r.totalContributed).toBe(10 * ppy);
    }
  });

  it("descompone valor = aportado + intereses en cada punto", () => {
    const r = project({
      initial: 1000,
      contribution: 100,
      frequency: "monthly",
      annualRate: 6,
      years: 20,
    });
    for (const p of r.series) {
      expect(p.value).toBeCloseTo(p.contributed + p.interest, 6);
    }
  });

  it("a mayor frecuencia de capitalización, mayor valor final (mismo total aportado/año)", () => {
    const annual = project({ initial: 0, contribution: 1200, frequency: "annual", annualRate: 8, years: 30 });
    const monthly = project({ initial: 0, contribution: 100, frequency: "monthly", annualRate: 8, years: 30 });
    // Ambos aportan 1200 €/año; la mensual capitaliza más a menudo.
    expect(monthly.totalContributed).toBeCloseTo(annual.totalContributed, 6);
    expect(monthly.finalValue).toBeGreaterThan(annual.finalValue);
  });

  describe("capitalización independiente de la frecuencia de aportación", () => {
    const RATES = [0, 3, 7, 12.5, -2, -50];

    it("sin aportaciones el resultado no depende de la frecuencia de aportación", () => {
      for (const compounding of [undefined, ...COMPOUNDING_FREQUENCIES]) {
        for (const annualRate of RATES) {
          const values = FREQUENCIES.map(
            (frequency) =>
              project({ initial: 10000, contribution: 0, frequency, compounding, annualRate, years: 1 }).finalValue,
          );
          for (const v of values) expect(relClose(v, itemAt(values, 0))).toBe(true);
        }
      }
    });

    it("lo mismo en varios años, y también con inflación y comisión", () => {
      for (const years of [1, 7, 30]) {
        const results = FREQUENCIES.map((frequency) =>
          project({
            initial: 5000,
            contribution: 0,
            frequency,
            compounding: "monthly",
            annualRate: 6,
            annualFee: 0.5,
            inflationRate: 2.5,
            years,
          }),
        );
        for (const r of results) {
          expect(relClose(r.finalValue, itemAt(results, 0).finalValue)).toBe(true);
          expect(relClose(r.finalRealValue, itemAt(results, 0).finalRealValue)).toBe(true);
        }
      }
    });

    it("por defecto la capitalización es anual: la tasa es la rentabilidad anual efectiva", () => {
      for (const frequency of FREQUENCIES) {
        const r = project({ initial: 10000, contribution: 0, frequency, annualRate: 7, years: 1 });
        expect(r.finalValue).toBeCloseTo(10700, 8);
      }
    });

    it("la capitalización mensual a un tipo nominal r da (1 + r/12)^12 en un año", () => {
      for (const frequency of FREQUENCIES) {
        const r = project({
          initial: 10000,
          contribution: 0,
          frequency,
          compounding: "monthly",
          annualRate: 7,
          years: 1,
        });
        expect(r.finalValue).toBeCloseTo(10000 * Math.pow(1 + 0.07 / 12, 12), 8);
      }
    });

    it("más capitalización intra-anual da más, con la misma tasa nominal", () => {
      const final = (compounding: "annual" | "semiannual" | "quarterly" | "monthly") =>
        project({ initial: 1000, contribution: 0, frequency: "monthly", compounding, annualRate: 8, years: 10 })
          .finalValue;
      expect(final("semiannual")).toBeGreaterThan(final("annual"));
      expect(final("quarterly")).toBeGreaterThan(final("semiannual"));
      expect(final("monthly")).toBeGreaterThan(final("quarterly"));
    });

    it("con aportaciones, la frecuencia solo cambia cuándo se aporta: mismo total anual, diferencia pequeña", () => {
      const final = (frequency: "annual" | "monthly", contribution: number) =>
        project({ initial: 0, contribution, frequency, annualRate: 8, years: 30 }).finalValue;
      const ratio = final("monthly", 100) / final("annual", 1200);
      expect(ratio).toBeGreaterThan(1);
      expect(ratio).toBeLessThan(1.05);
    });

    it("la inflación anual a un año descuenta exactamente 1 + i, con cualquier frecuencia", () => {
      for (const frequency of FREQUENCIES) {
        const r = project({ initial: 1000, contribution: 0, frequency, annualRate: 0, years: 1, inflationRate: 4 });
        expect(r.finalRealValue).toBeCloseTo(1000 / 1.04, 9);
      }
    });

    it("una rentabilidad de −100 % o menos anula el capital sin dar NaN (capitalización anual)", () => {
      for (const frequency of FREQUENCIES) {
        for (const annualRate of [-100, -150, -1e9]) {
          const r = project({ initial: 1000, contribution: 0, frequency, annualRate, years: 3 });
          expect(r.finalValue).toBe(0);
        }
      }
    });

    it("una tasa nominal muy negativa con capitalización mensual tampoco da NaN", () => {
      const r = project({
        initial: 1000,
        contribution: 0,
        frequency: "monthly",
        compounding: "monthly",
        annualRate: -1e9,
        years: 3,
      });
      expect(r.finalValue).toBe(0);
    });
  });
});
