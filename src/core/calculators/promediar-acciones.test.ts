import { describe, expect, it } from "vitest";
import { computeAveragePrice } from "./promediar-acciones";

describe("computeAveragePrice", () => {
  it("calcula el precio medio ponderado de varias compras", () => {
    const r = computeAveragePrice({
      purchases: [
        { price: 10, shares: 10 },
        { price: 20, shares: 10 },
      ],
    });
    expect(r.totalShares).toBe(20);
    expect(r.totalCost).toBe(300);
    expect(r.averagePrice).toBeCloseTo(15, 6);
  });

  it("pondera por número de acciones, no por número de compras", () => {
    const r = computeAveragePrice({
      purchases: [
        { price: 10, shares: 90 },
        { price: 100, shares: 10 },
      ],
    });
    expect(r.averagePrice).toBeCloseTo(19, 6); // (900 + 1000) / 100
  });

  it("incluye comisiones en el coste y el precio de equilibrio, no en el precio medio (defaults)", () => {
    const r = computeAveragePrice({
      purchases: [
        { price: 10, shares: 10, commission: 5 },
        { price: 8, shares: 15, commission: 5 },
      ],
    });
    expect(r.grossCost).toBe(220);
    expect(r.totalCommission).toBe(10);
    expect(r.totalCost).toBe(230);
    expect(r.averagePrice).toBeCloseTo(8.8, 6);
    expect(r.breakEvenPrice).toBeCloseTo(9.2, 6);
  });

  it("valora la posición a precio actual de mercado (defaults)", () => {
    const r = computeAveragePrice({
      purchases: [
        { price: 10, shares: 10, commission: 5 },
        { price: 8, shares: 15, commission: 5 },
      ],
      currentPrice: 12,
    });
    expect(r.marketValue).toBe(300);
    expect(r.unrealizedGain).toBe(70);
    expect(r.returnPct).toBeCloseTo(30.434782608695656, 6);
  });

  it("sin precio actual deja la valoración en null", () => {
    const r = computeAveragePrice({ purchases: [{ price: 10, shares: 10 }] });
    expect(r.marketValue).toBeNull();
    expect(r.unrealizedGain).toBeNull();
    expect(r.returnPct).toBeNull();
  });

  it("devuelve ceros con una lista vacía (sin dividir por cero)", () => {
    const r = computeAveragePrice({ purchases: [] });
    expect(r.totalShares).toBe(0);
    expect(r.totalCost).toBe(0);
    expect(r.averagePrice).toBe(0);
    expect(r.breakEvenPrice).toBe(0);
  });

  it("ignora valores negativos", () => {
    const r = computeAveragePrice({ purchases: [{ price: -5, shares: -3, commission: -2 }] });
    expect(r.totalShares).toBe(0);
    expect(r.averagePrice).toBe(0);
    expect(r.totalCommission).toBe(0);
  });
});
