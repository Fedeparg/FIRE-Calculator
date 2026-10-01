import { describe, expect, it } from "vitest";
import { HISTORICAL_RETURNS } from "./shiller-returns.js";

describe("HISTORICAL_RETURNS (Shiller)", () => {
  it("cubre años consecutivos desde 1871, sin huecos", () => {
    expect(HISTORICAL_RETURNS[0].year).toBe(1871);
    expect(HISTORICAL_RETURNS.length).toBeGreaterThanOrEqual(150);
    HISTORICAL_RETURNS.forEach((row, i) => expect(row.year).toBe(1871 + i));
  });

  it("no contiene valores no finitos ni pérdidas imposibles", () => {
    for (const row of HISTORICAL_RETURNS) {
      expect(Number.isFinite(row.stocks)).toBe(true);
      expect(Number.isFinite(row.bonds)).toBe(true);
      expect(row.stocks).toBeGreaterThan(-1);
      expect(row.bonds).toBeGreaterThan(-1);
    }
  });

  it("reproduce las cifras de referencia de la literatura", () => {
    // Rentabilidad real geométrica de la bolsa de EE. UU. desde 1871: en torno al 6,5-7 %.
    const growth = HISTORICAL_RETURNS.reduce((acc, row) => acc * (1 + row.stocks), 1);
    const geometric = growth ** (1 / HISTORICAL_RETURNS.length) - 1;
    expect(geometric).toBeGreaterThan(0.06);
    expect(geometric).toBeLessThan(0.075);
    // Años de caídas conocidas.
    const byYear = new Map(HISTORICAL_RETURNS.map((row) => [row.year, row]));
    expect(byYear.get(1931)?.stocks).toBeLessThan(-0.3);
    expect(byYear.get(2008)?.stocks).toBeLessThan(-0.3);
  });
});
