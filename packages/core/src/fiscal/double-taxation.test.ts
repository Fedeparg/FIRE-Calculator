import { describe, expect, it } from "vitest";

import { computeDoubleTaxationDeduction, TREATY_DIVIDEND_RATES } from "./double-taxation.js";
import { itemAt } from "../arrays.js";

describe("computeDoubleTaxationDeduction", () => {
  it("no income: everything is 0", () => {
    const r = computeDoubleTaxationDeduction([], 19);
    expect(r).toMatchObject({ deduction: 0, creditableTotal: 0, limit: 0, warnings: [] });
  });

  it("US withheld at the treaty rate: fully deductible", () => {
    const r = computeDoubleTaxationDeduction([{ country: "US", gross: 1000, withholdingOrigin: 150 }], 19);
    expect(r.countries[0]).toMatchObject({ creditable: 150, excessReclaimable: 0, treatyRatePct: 15 });
    expect(r.deduction).toBe(150);
    expect(r.warnings).toEqual([]);
  });

  it("Switzerland 35%: credits 15% and reclaims 20%", () => {
    const r = computeDoubleTaxationDeduction([{ country: "CH", gross: 1000, withholdingOrigin: 350 }], 21);
    expect(r.countries[0]).toMatchObject({ creditable: 150, excessReclaimable: 200 });
    expect(r.warnings).toEqual([{ code: "excess_withholding", country: "CH", amount: 200 }]);
    expect(r.deduction).toBe(150);
  });

  it("the treaty cap applies per payment: the excess on one is not offset by the headroom of another", () => {
    // Two US payments (15% treaty), one withheld at 30% and one with no withholding. In aggregate,
    // €300 would fit within 15% of €2,000; per payment, only €150 is credited and €150 is reclaimed
    // at source.
    const r = computeDoubleTaxationDeduction(
      [
        { country: "US", gross: 1000, withholdingOrigin: 300 },
        { country: "US", gross: 1000, withholdingOrigin: 0 },
      ],
      19,
    );
    expect(r.countries[0]).toMatchObject({
      gross: 2000,
      withholdingOrigin: 300,
      creditable: 150,
      excessReclaimable: 150,
    });
    expect(r.limit).toBe(380);
    expect(r.deduction).toBe(150);
  });

  it("the average-rate limit applies per country: one country's headroom does not cover another's excess", () => {
    // At 10%: the US credits €150 against a €100 limit; Ireland, nothing against a €100 limit.
    // In aggregate it would be €150 (limit €200); country by country, €100.
    const r = computeDoubleTaxationDeduction(
      [
        { country: "US", gross: 1000, withholdingOrigin: 150 },
        { country: "IE", gross: 1000, withholdingOrigin: 0 },
      ],
      10,
    );
    expect(r.countries.map((c) => [c.country, c.limit, c.deduction])).toEqual([
      ["IE", 100, 0],
      ["US", 100, 100],
    ]);
    expect(r.limit).toBe(200);
    expect(r.deduction).toBe(100);
    expect(r.limitedByAverageRate).toBe(true);
  });

  it("the effective average rate limits the deduction", () => {
    const r = computeDoubleTaxationDeduction([{ country: "US", gross: 1000, withholdingOrigin: 150 }], 10);
    expect(r.limit).toBe(100);
    expect(r.deduction).toBe(100);
    expect(r.limitedByAverageRate).toBe(true);
  });

  it("rounds the average rate to two decimals (art. 80.2)", () => {
    const r = computeDoubleTaxationDeduction([{ country: "US", gross: 1000, withholdingOrigin: 150 }], 10.126);
    expect(r.averageRatePct).toBe(10.13);
  });

  it("unknown withholding: warning and no deduction", () => {
    const r = computeDoubleTaxationDeduction([{ country: "US", gross: 500, withholdingOrigin: null }], 19);
    expect(r.deduction).toBe(0);
    expect(r.warnings).toEqual([{ code: "origin_unknown", country: "US", amount: 500 }]);
  });

  it("country without a confirmed treaty rate: warning and no deduction", () => {
    const r = computeDoubleTaxationDeduction([{ country: "zz", gross: 100, withholdingOrigin: 25 }], 19);
    expect(r.deduction).toBe(0);
    expect(r.warnings).toEqual([{ code: "no_treaty_rate", country: "ZZ", amount: 25 }]);
  });

  it("null average rate (base 0): no deduction", () => {
    const r = computeDoubleTaxationDeduction([{ country: "US", gross: 100, withholdingOrigin: 15 }], null);
    expect(r.deduction).toBe(0);
  });

  it("groups by country and mixes known and unknown withholdings", () => {
    const r = computeDoubleTaxationDeduction(
      [
        { country: "DE", gross: 100, withholdingOrigin: 26.375 },
        { country: "de", gross: 200, withholdingOrigin: null },
      ],
      21,
    );
    expect(r.countries).toHaveLength(1);
    expect(r.countries[0]).toMatchObject({ gross: 300, unknownGross: 200, creditable: 15 });
    expect(itemAt(r.countries, 0).excessReclaimable).toBeCloseTo(11.375, 9);
  });

  it("the treaty table contains the countries confirmed by the DGT", () => {
    expect(TREATY_DIVIDEND_RATES).toMatchObject({
      US: 15,
      NL: 15,
      DE: 15,
      FR: 15,
      CH: 15,
      GB: 10,
      CN: 10,
      HK: 10,
      JP: 5,
    });
    // Ireland: the treaty exempts at source (art. 10.1.c); nothing withheld there is deductible in Spain.
    expect(TREATY_DIVIDEND_RATES.IE).toBe(0);
  });

  it("without a treaty (Denmark) everything paid is credited, subject to the average-rate limit", () => {
    const r = computeDoubleTaxationDeduction([{ country: "DK", gross: 100, withholdingOrigin: 27 }], 19);
    expect(r.countries[0]).toMatchObject({ creditable: 27, excessReclaimable: 0, treatyRatePct: null });
    expect(r.deduction).toBeCloseTo(19, 10);
    expect(r.warnings).toEqual([]);
  });

  it("Japan uses the 5% of the treaty in force since 2021, not the 15% of the 2018 table", () => {
    const r = computeDoubleTaxationDeduction([{ country: "JP", gross: 100, withholdingOrigin: 15.315 }], 19);
    expect(itemAt(r.countries, 0).creditable).toBeCloseTo(5, 10);
  });
});
