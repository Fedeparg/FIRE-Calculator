import { describe, expect, it } from "vitest";
import { computeCreditCard } from "./tarjeta-credito.js";
import { defined } from "../assert.js";

describe("computeCreditCard", () => {
  it("salda una deuda sin intereses en el número exacto de meses", () => {
    const r = computeCreditCard({ balance: 1200, annualRate: 0, monthlyPayment: 100 });
    expect(r.monthsToPayoff).toBe(12);
    expect(r.totalInterest).toBeCloseTo(0, 6);
  });

  it("devuelve null si el pago no cubre ni los intereses (deuda eterna)", () => {
    // 1000 al 24% anual → 20 €/mes de interés; pagar 20 € no reduce el saldo.
    const r = computeCreditCard({ balance: 1000, annualRate: 24, monthlyPayment: 20 });
    expect(r.monthsToPayoff).toBeNull();
  });

  it("con intereses, el total pagado supera al saldo inicial", () => {
    const r = computeCreditCard({ balance: 1000, annualRate: 24, monthlyPayment: 100 });
    expect(r.monthsToPayoff).not.toBeNull();
    expect(r.totalInterest).toBeGreaterThan(0);
    expect(r.totalPaid).toBeGreaterThan(1000);
  });

  it("saldo 0 no genera nada", () => {
    const r = computeCreditCard({ balance: 0, annualRate: 24, monthlyPayment: 100 });
    expect(r.monthsToPayoff).toBe(0);
    expect(r.totalPaid).toBe(0);
  });

  it("golden: cuota fija (valores por defecto del componente)", () => {
    const r = computeCreditCard({
      balance: 2000,
      annualRate: 22,
      paymentMode: "fixed",
      monthlyPayment: 100,
    });
    expect(r.monthsToPayoff).toBe(26);
    expect(r.totalInterest).toBeCloseTo(514.29, 2);
    expect(r.totalPaid).toBeCloseTo(2514.29, 2);
    // La serie llega hasta el mes de pago y termina en saldo 0.
    expect(r.series.at(-1)?.month).toBe(26);
    expect(r.series.at(-1)?.balance).toBe(0);
  });

  it("golden: cuota mínima revolving (3% del saldo, suelo 25 €) alarga la deuda", () => {
    const r = computeCreditCard({
      balance: 2000,
      annualRate: 22,
      paymentMode: "percent",
      monthlyPayment: 100,
      minPercent: 3,
      minFloor: 25,
    });
    expect(r.monthsToPayoff).toBe(127);
    expect(r.firstPayment).toBeCloseTo(60, 2);
    expect(r.totalInterest).toBeCloseTo(2299.67, 2);
    expect(r.totalPaid).toBeCloseTo(4299.67, 2);
    // El suelo garantiza que termina: paga muchísimo más en intereses.
    expect(r.totalInterest).toBeGreaterThan(2000);
  });

  it("modo percent sin suelo nunca salda la deuda (sería asintótico)", () => {
    const r = computeCreditCard({
      balance: 2000,
      annualRate: 22,
      paymentMode: "percent",
      monthlyPayment: 100,
      minPercent: 3,
      minFloor: 0,
    });
    expect(r.monthsToPayoff).toBeNull();
  });

  it("la cuota fija salda antes que la mínima del mismo importe inicial", () => {
    const fixed = computeCreditCard({
      balance: 2000,
      annualRate: 22,
      paymentMode: "fixed",
      monthlyPayment: 60,
    });
    const percent = computeCreditCard({
      balance: 2000,
      annualRate: 22,
      paymentMode: "percent",
      monthlyPayment: 0,
      minPercent: 3,
      minFloor: 25,
    });
    // Ambas empiezan pagando 60 €, pero la mínima baja con el saldo → tarda más.
    expect(percent.monthsToPayoff).toBeGreaterThan(defined(fixed.monthsToPayoff));
  });
});
