import { describe, expect, it } from "vitest";
import { HISTORICAL_RETURNS } from "./shiller-returns.js";
import { itemAt } from "../arrays.js";

describe("HISTORICAL_RETURNS (Shiller)", () => {
  it("covers consecutive years since 1871, with no gaps", () => {
    expect(itemAt(HISTORICAL_RETURNS, 0).year).toBe(1871);
    expect(HISTORICAL_RETURNS.length).toBeGreaterThanOrEqual(150);
    HISTORICAL_RETURNS.forEach((row, i) => expect(row.year).toBe(1871 + i));
  });

  it("contains no non-finite values or impossible losses", () => {
    for (const row of HISTORICAL_RETURNS) {
      expect(Number.isFinite(row.stocks)).toBe(true);
      expect(Number.isFinite(row.bonds)).toBe(true);
      expect(row.stocks).toBeGreaterThan(-1);
      expect(row.bonds).toBeGreaterThan(-1);
    }
  });

  it("reproduces the reference figures from the literature", () => {
    // Geometric real return of the US stock market since 1871: around 6.5-7%.
    const growth = HISTORICAL_RETURNS.reduce((acc, row) => acc * (1 + row.stocks), 1);
    const geometric = growth ** (1 / HISTORICAL_RETURNS.length) - 1;
    expect(geometric).toBeGreaterThan(0.06);
    expect(geometric).toBeLessThan(0.075);
    // Years of well-known crashes.
    const byYear = new Map(HISTORICAL_RETURNS.map((row) => [row.year, row]));
    expect(byYear.get(1931)?.stocks).toBeLessThan(-0.3);
    expect(byYear.get(2008)?.stocks).toBeLessThan(-0.3);
  });
});
