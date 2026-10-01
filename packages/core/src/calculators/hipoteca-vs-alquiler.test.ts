import { describe, expect, it } from "vitest";
import { computeBuyVsRent } from "./hipoteca-vs-alquiler.js";

const base = {
  purchasePrice: 250000,
  purchaseCosts: 25000,
  downPayment: 50000,
  mortgageRate: 3,
  mortgageTerm: 30,
  annualCostRate: 1,
  appreciationRate: 2,
  monthlyRent: 1000,
  rentGrowthRate: 2,
  investmentReturn: 5,
  horizonYears: 10,
};

describe("computeBuyVsRent", () => {
  it("acumula el alquiler con su subida anual", () => {
    const r = computeBuyVsRent(base);
    // Σ 12.000 × 1,02^y para y=0..9 > 120.000 (sin subida)
    expect(r.totalRentPaid).toBeGreaterThan(120000);
  });

  it("el patrimonio en el inmueble crece con la revalorización", () => {
    const r = computeBuyVsRent(base);
    expect(r.buyEquityEnd).toBeGreaterThan(0);
  });

  it("una revalorización alta inclina la balanza hacia comprar", () => {
    const compra = computeBuyVsRent({ ...base, appreciationRate: 6 });
    expect(compra.buyNetCost).toBeLessThan(compra.rentNetCost);
    expect(compra.cheaper).toBe("buy");
  });

  it("una rentabilidad de inversión alta favorece alquilar", () => {
    const alquila = computeBuyVsRent({ ...base, appreciationRate: 0, investmentReturn: 9 });
    expect(alquila.cheaper === "rent" || alquila.difference < 0).toBe(true);
  });

  it("la diferencia es coherente con los costes netos", () => {
    const r = computeBuyVsRent(base);
    expect(r.difference).toBeCloseTo(r.rentNetCost - r.buyNetCost, 4);
  });

  it("los gastos de venta reducen el patrimonio neto y encarecen comprar", () => {
    const sinVenta = computeBuyVsRent(base);
    const conVenta = computeBuyVsRent({ ...base, sellingCostsRate: 5 });
    expect(conVenta.buyEquityEnd).toBeLessThan(sinVenta.buyEquityEnd);
    expect(conVenta.buyNetCost).toBeGreaterThan(sinVenta.buyNetCost);
  });
});
