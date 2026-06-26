import { describe, expect, it } from "vitest";
import {
  estimateNetSalary,
  generalIncomeTax,
  personalAndFamilyMinimum,
  workIncomeReduction,
} from "./irpf";

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
