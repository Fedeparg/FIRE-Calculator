import { describe, expect, it } from "vitest";
import { amortizationSchedule, levelPayment, monthlyRate, presentValueOfPayments } from "./amortization.js";

describe("monthlyRate", () => {
  it("convierte el TIN anual en base 100 a fracción mensual", () => {
    expect(monthlyRate(12)).toBeCloseTo(0.01, 12);
    expect(monthlyRate(0)).toBe(0);
  });

  it("trata NaN como 0 y deja pasar Infinity", () => {
    expect(monthlyRate(Number.NaN)).toBe(0);
    expect(monthlyRate(Infinity)).toBe(Infinity);
  });
});

describe("levelPayment", () => {
  it("coincide con la fórmula francesa", () => {
    // 100.000 € al 3 % a 30 años: cuota de referencia 421,60 €
    expect(levelPayment(100000, monthlyRate(3), 360)).toBeCloseTo(421.6, 2);
  });

  it("con tipo 0 reparte el capital a partes iguales", () => {
    expect(levelPayment(1200, 0, 12)).toBe(100);
  });

  it("con capital 0 la cuota es 0", () => {
    expect(levelPayment(0, 0.003, 120)).toBe(0);
    expect(levelPayment(0, 0, 120)).toBe(0);
  });

  it("un solo pago devuelve el capital más un mes de intereses", () => {
    expect(levelPayment(1000, 0.01, 1)).toBeCloseTo(1010, 9);
  });

  it("con un tipo enorme la cuota tiende a capital × tipo, sin desbordar", () => {
    const payment = levelPayment(1000, 1e6, 360);
    expect(Number.isFinite(payment)).toBe(true);
    expect(payment).toBeCloseTo(1000 * 1e6, -3);
  });
});

describe("presentValueOfPayments", () => {
  it("es la inversa de levelPayment", () => {
    for (const rate of [0, 0.0005, 0.0025, 0.02]) {
      for (const months of [1, 12, 360]) {
        const payment = levelPayment(180000, rate, months);
        expect(presentValueOfPayments(payment, rate, months)).toBeCloseTo(180000, 4);
      }
    }
  });

  it("con tipo 0 es cuota × meses", () => {
    expect(presentValueOfPayments(500, 0, 360)).toBe(180000);
  });

  it("con cuota 0 financia 0", () => {
    expect(presentValueOfPayments(0, 0.003, 240)).toBe(0);
  });
});

describe("amortizationSchedule", () => {
  it("amortiza el capital por completo en el plazo", () => {
    const rate = monthlyRate(3);
    const months = [...amortizationSchedule(100000, rate, levelPayment(100000, rate, 360), 360)];
    expect(months).toHaveLength(360);
    expect(months[0].month).toBe(1);
    expect(months[0].balanceBefore).toBe(100000);
    expect(months[0].interest).toBeCloseTo(250, 9);
    expect(months.at(-1)?.balanceAfter).toBeCloseTo(0, 6);
  });

  it("encadena el saldo final de cada mes con el inicial del siguiente", () => {
    const months = [...amortizationSchedule(5000, 0.01, 300, 20)];
    months.slice(1).forEach((m, k) => expect(m.balanceBefore).toBe(months[k].balanceAfter));
  });

  it("no deja saldo negativo cuando la última cuota excede el saldo", () => {
    const months = [...amortizationSchedule(100, 0, 60, 5)];
    expect(months.map((m) => m.balanceAfter)).toEqual([40, 0, 0, 0, 0]);
    // el capital amortizado no se acota: es el consumidor quien decide
    expect(months[2].principalPart).toBe(60);
  });

  it("expone un capital negativo si la cuota no cubre los intereses", () => {
    const [first, second] = [...amortizationSchedule(1000, 0.1, 50, 2)];
    expect(first.principalPart).toBe(-50);
    expect(second.balanceBefore).toBe(1050);
  });

  it("sin meses no produce nada", () => {
    expect([...amortizationSchedule(1000, 0.01, 100, 0)]).toEqual([]);
  });

  it("es perezoso: el consumidor puede cortar sin recorrer todo el plazo", () => {
    let seen = 0;
    for (const m of amortizationSchedule(1000, 0.01, 100, 1e9)) {
      seen++;
      if (m.month === 3) break;
    }
    expect(seen).toBe(3);
  });
});
