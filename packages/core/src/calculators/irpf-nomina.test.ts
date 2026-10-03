import { describe, expect, it } from "vitest";
import { computePayrollWithholding } from "./irpf-nomina.js";

describe("computePayrollWithholding", () => {
  it("component defaults (golden)", () => {
    const r = computePayrollWithholding({
      grossAnnual: 30000,
      payments: 14,
      contractType: "indefinido",
      age: 30,
    });
    expect(r.annualWithholding).toBe(4926);
    expect(r.withholdingRate).toBeCloseTo(16.42, 2);
    expect(r.withholdingPerPayment).toBeCloseTo(351.857142857, 6);
    expect(r.socialSecurityPerPayment).toBeCloseTo(139.285714285, 6);
    expect(r.netPerPayment).toBeCloseTo(1651.714285714, 6);
    expect(r.grossPerPayment).toBeCloseTo(2142.857142857, 6);
  });

  it("family circumstances reduce the withholding", () => {
    const solo = computePayrollWithholding({ grossAnnual: 30000, age: 30 });
    const familia = computePayrollWithholding({ grossAnnual: 30000, age: 30, children: 2, childrenUnder3: 1 });
    expect(familia.annualWithholding).toBeLessThan(solo.annualWithholding);
  });

  it("spreads the annual withholding across the payments", () => {
    const r = computePayrollWithholding({ grossAnnual: 42000, payments: 14 });
    expect(r.withholdingPerPayment).toBeCloseTo(r.annualWithholding / 14, 6);
    expect(r.grossPerPayment).toBeCloseTo(3000, 6);
  });

  it("the withholding rate rises with the salary", () => {
    const bajo = computePayrollWithholding({ grossAnnual: 18000 });
    const alto = computePayrollWithholding({ grossAnnual: 60000 });
    expect(alto.withholdingRate).toBeGreaterThan(bajo.withholdingRate);
  });

  it("net = gross − SS − IRPF per payment", () => {
    const r = computePayrollWithholding({ grossAnnual: 28000, payments: 12 });
    expect(r.netPerPayment).toBeCloseTo(r.grossPerPayment - r.socialSecurityPerPayment - r.withholdingPerPayment, 4);
  });
});
