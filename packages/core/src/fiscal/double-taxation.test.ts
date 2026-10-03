import { describe, expect, it } from "vitest";

import { computeDoubleTaxationDeduction, TREATY_DIVIDEND_RATES } from "./double-taxation.js";

describe("computeDoubleTaxationDeduction", () => {
  it("sin rentas: todo a 0", () => {
    const r = computeDoubleTaxationDeduction([], 19);
    expect(r).toMatchObject({ deduction: 0, creditableTotal: 0, limit: 0, warnings: [] });
  });

  it("EE. UU. con retención del convenio: se deduce entera", () => {
    const r = computeDoubleTaxationDeduction([{ country: "US", gross: 1000, withholdingOrigin: 150 }], 19);
    expect(r.countries[0]).toMatchObject({ creditable: 150, excessReclaimable: 0, treatyRatePct: 15 });
    expect(r.deduction).toBe(150);
    expect(r.warnings).toEqual([]);
  });

  it("Suiza 35 %: acredita el 15 % y reclama el 20 %", () => {
    const r = computeDoubleTaxationDeduction([{ country: "CH", gross: 1000, withholdingOrigin: 350 }], 21);
    expect(r.countries[0]).toMatchObject({ creditable: 150, excessReclaimable: 200 });
    expect(r.warnings).toEqual([{ code: "excess_withholding", country: "CH", amount: 200 }]);
    expect(r.deduction).toBe(150);
  });

  it("el tipo medio efectivo limita la deducción", () => {
    const r = computeDoubleTaxationDeduction([{ country: "US", gross: 1000, withholdingOrigin: 150 }], 10);
    expect(r.limit).toBe(100);
    expect(r.deduction).toBe(100);
    expect(r.limitedByAverageRate).toBe(true);
  });

  it("redondea el tipo medio a dos decimales (art. 80.2)", () => {
    const r = computeDoubleTaxationDeduction([{ country: "US", gross: 1000, withholdingOrigin: 150 }], 10.126);
    expect(r.averageRatePct).toBe(10.13);
  });

  it("retención desconocida: aviso y sin deducción", () => {
    const r = computeDoubleTaxationDeduction([{ country: "US", gross: 500, withholdingOrigin: null }], 19);
    expect(r.deduction).toBe(0);
    expect(r.warnings).toEqual([{ code: "origin_unknown", country: "US", amount: 500 }]);
  });

  it("país sin tipo de convenio confirmado: aviso y sin deducción", () => {
    const r = computeDoubleTaxationDeduction([{ country: "zz", gross: 100, withholdingOrigin: 25 }], 19);
    expect(r.deduction).toBe(0);
    expect(r.warnings).toEqual([{ code: "no_treaty_rate", country: "ZZ", amount: 25 }]);
  });

  it("tipo medio null (base 0): no hay deducción", () => {
    const r = computeDoubleTaxationDeduction([{ country: "US", gross: 100, withholdingOrigin: 15 }], null);
    expect(r.deduction).toBe(0);
  });

  it("agrupa por país y mezcla retenciones conocidas y desconocidas", () => {
    const r = computeDoubleTaxationDeduction(
      [
        { country: "DE", gross: 100, withholdingOrigin: 26.375 },
        { country: "de", gross: 200, withholdingOrigin: null },
      ],
      21,
    );
    expect(r.countries).toHaveLength(1);
    expect(r.countries[0]).toMatchObject({ gross: 300, unknownGross: 200, creditable: 15 });
    expect(r.countries[0].excessReclaimable).toBeCloseTo(11.375, 9);
  });

  it("la tabla del convenio contiene los países de la DGT confirmados", () => {
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
    // Irlanda: el convenio exime en origen (art. 10.1.c); nada de lo retenido allí se deduce en España.
    expect(TREATY_DIVIDEND_RATES.IE).toBe(0);
  });

  it("sin convenio (Dinamarca) se acredita todo lo pagado, con el límite del tipo medio", () => {
    const r = computeDoubleTaxationDeduction([{ country: "DK", gross: 100, withholdingOrigin: 27 }], 19);
    expect(r.countries[0]).toMatchObject({ creditable: 27, excessReclaimable: 0, treatyRatePct: null });
    expect(r.deduction).toBeCloseTo(19, 10);
    expect(r.warnings).toEqual([]);
  });

  it("Japón usa el 5 % del convenio vigente desde 2021, no el 15 % de la tabla de 2018", () => {
    const r = computeDoubleTaxationDeduction([{ country: "JP", gross: 100, withholdingOrigin: 15.315 }], 19);
    expect(r.countries[0].creditable).toBeCloseTo(5, 10);
  });
});
