import { describe, expect, it } from "vitest";
import { PERIODS_PER_YEAR, project } from "./projection";

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
});
