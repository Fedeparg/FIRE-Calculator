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
  it("rendimiento bajo → reducción máxima fija", () => {
    expect(workIncomeReduction(10000)).toBe(7302);
    expect(workIncomeReduction(14852)).toBe(7302);
  });

  it("tramo intermedio decrece de forma continua", () => {
    expect(workIncomeReduction(16000)).toBeCloseTo(7302 - 1.75 * (16000 - 14852), 4);
  });

  it("se anula por encima del límite", () => {
    expect(workIncomeReduction(19747.5)).toBeCloseTo(0, 2);
    expect(workIncomeReduction(25000)).toBe(0);
  });

  it("nunca es negativa", () => {
    expect(workIncomeReduction(19000)).toBeGreaterThanOrEqual(0);
  });
});

describe("generalIncomeTax", () => {
  it("una base igual al mínimo personal no tributa", () => {
    expect(generalIncomeTax(5550)).toBeCloseTo(0, 6);
  });

  it("base por debajo del mínimo personal → 0 (nunca negativa)", () => {
    expect(generalIncomeTax(3000)).toBe(0);
  });

  it("crece con la base", () => {
    expect(generalIncomeTax(30000)).toBeGreaterThan(generalIncomeTax(20000));
  });
});

describe("estimateNetSalary", () => {
  it("aplica SS del 6,5% sobre el bruto", () => {
    const r = estimateNetSalary({ grossAnnual: 30000 });
    expect(r.socialSecurity).toBeCloseTo(1950, 6);
  });

  it("un salario en torno al SMI apenas tributa por IRPF", () => {
    const r = estimateNetSalary({ grossAnnual: 16000 });
    expect(r.incomeTax).toBeLessThan(300);
    expect(r.netAnnual).toBeLessThan(r.grossAnnual);
  });

  it("el neto es menor que el bruto y la retención positiva", () => {
    const r = estimateNetSalary({ grossAnnual: 40000 });
    expect(r.netAnnual).toBeLessThan(40000);
    expect(r.withholdingRate).toBeGreaterThan(0);
    expect(r.totalDeductionRate).toBeGreaterThan(r.withholdingRate);
  });

  it("aportar a un plan de pensiones reduce el IRPF", () => {
    const sin = estimateNetSalary({ grossAnnual: 40000 });
    const con = estimateNetSalary({ grossAnnual: 40000, pensionContribution: 1500 });
    expect(con.incomeTax).toBeLessThan(sin.incomeTax);
  });

  it("reparte el neto entre el número de pagas indicado", () => {
    const r = estimateNetSalary({ grossAnnual: 28000, payments: 12 });
    expect(r.netPerPayment).toBeCloseTo(r.netAnnual / 12, 6);
  });

  // Valores "golden" verificados a mano contra el motor y referencias públicas.
  it("GOLDEN: 30.000 € soltero sin hijos (14 pagas)", () => {
    const r = estimateNetSalary({ grossAnnual: 30000, payments: 14 });
    expect(r.socialSecurity).toBeCloseTo(1950, 2);
    expect(r.incomeTax).toBeCloseTo(4926, 0);
    expect(r.netAnnual).toBeCloseTo(23124, 0);
    expect(r.personalMinimum).toBe(5550);
  });

  it("los hijos a cargo reducen el IRPF", () => {
    const sin = estimateNetSalary({ grossAnnual: 30000 });
    const con = estimateNetSalary({ grossAnnual: 30000, children: 2 });
    expect(con.incomeTax).toBeLessThan(sin.incomeTax);
    expect(con.personalMinimum).toBeGreaterThan(sin.personalMinimum);
  });

  it("el contrato temporal cotiza algo más a la SS", () => {
    const indef = estimateNetSalary({ grossAnnual: 30000, contractType: "indefinido" });
    const temp = estimateNetSalary({ grossAnnual: 30000, contractType: "temporal" });
    expect(temp.socialSecurity).toBeGreaterThan(indef.socialSecurity);
  });

  it("la tributación conjunta reduce la base y el IRPF", () => {
    const ind = estimateNetSalary({ grossAnnual: 30000 });
    const conj = estimateNetSalary({ grossAnnual: 30000, jointReturn: true });
    expect(conj.incomeTax).toBeLessThan(ind.incomeTax);
  });

  it("la cotización a la SS se topa en la base máxima", () => {
    const r = estimateNetSalary({ grossAnnual: 200000 });
    // Base máxima 61.214,40 € × 6,5 % = 3.978,94 €, no 13.000 €.
    expect(r.socialSecurity).toBeCloseTo(61214.4 * 0.065, 2);
  });
});

describe("personalAndFamilyMinimum", () => {
  it("mínimo del contribuyente por defecto", () => {
    expect(personalAndFamilyMinimum()).toBe(5550);
  });

  it("aumenta con la edad", () => {
    expect(personalAndFamilyMinimum({ age: 70 })).toBe(6700);
    expect(personalAndFamilyMinimum({ age: 80 })).toBe(8100);
  });

  it("acumula el mínimo por descendientes en orden", () => {
    // 5.550 + 2.400 (1.º) + 2.700 (2.º) = 10.650
    expect(personalAndFamilyMinimum({ children: 2 })).toBe(10650);
  });

  it("suma 2.800 € por cada hijo menor de 3 años", () => {
    expect(personalAndFamilyMinimum({ children: 1, childrenUnder3: 1 })).toBe(5550 + 2400 + 2800);
  });

  it("suma ascendientes y discapacidad", () => {
    expect(personalAndFamilyMinimum({ ascendants: 1 })).toBe(5550 + 1150);
    expect(personalAndFamilyMinimum({ disability: "g65" })).toBe(5550 + 9000);
  });
});

describe("IRPF por comunidad autónoma", () => {
  const BASES = [0, 5550, 12450, 20000, 30000, 60000, 100000, 300000, 500000];

  it("sin comunidad el resultado es exactamente el de siempre (escala conjunta)", () => {
    for (const base of BASES) {
      const legacy = generalIncomeTax(base);
      expect(generalIncomeTax(base, PERSONAL_MINIMUM, {})).toBe(legacy);
      expect(generalIncomeTax(base, PERSONAL_MINIMUM, { region: undefined })).toBe(legacy);
      // Un mínimo autonómico distinto es irrelevante mientras no haya comunidad.
      expect(generalIncomeTax(base, PERSONAL_MINIMUM, { regionalMinimum: 9999 })).toBe(legacy);
    }
  });

  it("Castilla-La Mancha da el mismo resultado que no indicar comunidad", () => {
    // Su escala autonómica es idéntica a la supletoria y no modifica el mínimo:
    // es la comprobación de que sumar estatal + autonómica no introduce sesgo.
    for (const base of BASES) {
      expect(generalIncomeTax(base, PERSONAL_MINIMUM, { region: "castilla-la-mancha" })).toBeCloseTo(
        generalIncomeTax(base),
        6,
      );
    }
  });

  it.each(REGION_CODES)("%s: cuota positiva, creciente y nunca superior al 47 % de la base", (region) => {
    const options = { region, regionalMinimum: regionalPersonalAndFamilyMinimum({ region }) };
    expect(generalIncomeTax(0, PERSONAL_MINIMUM, options)).toBe(0);
    expect(generalIncomeTax(40000, PERSONAL_MINIMUM, options)).toBeGreaterThan(
      generalIncomeTax(30000, PERSONAL_MINIMUM, options),
    );
    expect(generalIncomeTax(60000, PERSONAL_MINIMUM, options)).toBeLessThan(60000 * 0.47);
  });

  it("cada cuota se acota a cero por separado, no la suma", () => {
    // Asturias sube el mínimo del contribuyente a 6.105 €. Con una base de
    // 6.000 € hay cuota estatal (por encima de 5.550 €) y NO hay cuota
    // autonómica: 450 € al 9,5 % estatal = 42,75 €. Acotar la suma en lugar de
    // cada cuota daría 33,30 €, restando una cuota autonómica negativa.
    const options = {
      region: "asturias" as const,
      regionalMinimum: regionalPersonalAndFamilyMinimum({ region: "asturias" }),
    };
    expect(regionalPersonalAndFamilyMinimum({ region: "asturias" })).toBe(6105);
    expect(generalIncomeTax(6000, PERSONAL_MINIMUM, options)).toBeCloseTo(42.75, 6);
  });

  it("Madrid tributa menos que la escala supletoria y la Comunitat Valenciana, más", () => {
    const withRegion = (region: "madrid" | "valencia") =>
      generalIncomeTax(100000, PERSONAL_MINIMUM, {
        region,
        regionalMinimum: regionalPersonalAndFamilyMinimum({ region }),
      });
    expect(withRegion("madrid")).toBeLessThan(generalIncomeTax(100000));
    expect(withRegion("valencia")).toBeGreaterThan(generalIncomeTax(100000));
  });

  it("bases nulas o no finitas no rompen el cálculo con comunidad", () => {
    for (const region of REGION_CODES) {
      const options = { region, regionalMinimum: regionalPersonalAndFamilyMinimum({ region }) };
      expect(generalIncomeTax(0, PERSONAL_MINIMUM, options)).toBe(0);
      expect(generalIncomeTax(-1000, PERSONAL_MINIMUM, options)).toBe(0);
      expect(generalIncomeTax(Number.NaN, PERSONAL_MINIMUM, options)).toBe(0);
      expect(generalIncomeTax(Number.POSITIVE_INFINITY, PERSONAL_MINIMUM, options)).toBe(0);
      expect(generalIncomeTax(30000, Number.NaN, options)).toBeGreaterThan(0);
    }
  });

  it("el mínimo autonómico solo alimenta la cuota autonómica", () => {
    // Canarias baja el marginal de los primeros tramos y sube el mínimo: con la
    // misma base, su cuota difiere de la que sale usando el mínimo estatal en
    // ambas escalas.
    const base = 30000;
    const withOwnMinimum = generalIncomeTax(base, PERSONAL_MINIMUM, {
      region: "canarias",
      regionalMinimum: regionalPersonalAndFamilyMinimum({ region: "canarias" }),
    });
    const withStateMinimum = generalIncomeTax(base, PERSONAL_MINIMUM, { region: "canarias" });
    expect(regionalPersonalAndFamilyMinimum({ region: "canarias" })).toBe(5606);
    expect(withOwnMinimum).toBeLessThan(withStateMinimum);
  });

  it("las circunstancias familiares se aplican también al mínimo autonómico", () => {
    const c = { region: "galicia" as const, children: 2, childrenUnder3: 1 };
    // 5.789 + 2.503 + 2.816 + 2.920 (menor de 3 años) = 14.028 €.
    expect(regionalPersonalAndFamilyMinimum(c)).toBeCloseTo(14028, 6);
    // El mínimo estatal del mismo contribuyente sigue siendo el estatal.
    expect(personalAndFamilyMinimum(c)).toBeCloseTo(5550 + 2400 + 2700 + 2800, 6);
  });

  it("sin comunidad, el mínimo autonómico es el estatal", () => {
    const c = { children: 1, age: 70 };
    expect(regionalPersonalAndFamilyMinimum(c)).toBe(personalAndFamilyMinimum(c));
    expect(regionalPersonalAndFamilyMinimum()).toBe(personalAndFamilyMinimum());
  });
});

describe("generalMarginalRate", () => {
  it("sin comunidad devuelve el marginal de la escala conjunta", () => {
    expect(generalMarginalRate(30000)).toBe(30);
    expect(generalMarginalRate(400000)).toBe(47);
  });

  it("con comunidad suma el marginal estatal y el autonómico", () => {
    // Madrid: 17,40 % autonómico + 18,50 % estatal en el tramo de 35.200-57.320 €.
    expect(generalMarginalRate(40000, "madrid")).toBeCloseTo(35.9, 6);
    // La Rioja por encima de 120.000 €: 27 % + 22,50 % estatal.
    expect(generalMarginalRate(150000, "la-rioja")).toBeCloseTo(49.5, 6);
  });

  it("bases no finitas o negativas usan el primer tramo", () => {
    expect(generalMarginalRate(Number.NaN, "madrid")).toBeCloseTo(9.5 + 8.5, 6);
    expect(generalMarginalRate(-5000)).toBe(19);
  });
});

describe("estimateNetSalary por comunidad", () => {
  it("sin comunidad el resultado no cambia respecto del histórico", () => {
    const withoutRegion = estimateNetSalary({ grossAnnual: 30000 });
    const explicitUndefined = estimateNetSalary({ grossAnnual: 30000, region: undefined });
    expect(explicitUndefined).toEqual(withoutRegion);
  });

  it("la comunidad cambia el neto en la dirección esperada", () => {
    const base = { grossAnnual: 60000 };
    const madrid = estimateNetSalary({ ...base, region: "madrid" });
    const supletoria = estimateNetSalary(base);
    const valencia = estimateNetSalary({ ...base, region: "valencia" });
    expect(madrid.netAnnual).toBeGreaterThan(supletoria.netAnnual);
    expect(valencia.netAnnual).toBeLessThan(supletoria.netAnnual);
    // El mínimo que se reporta sigue siendo el estatal.
    expect(madrid.personalMinimum).toBe(supletoria.personalMinimum);
  });
});
