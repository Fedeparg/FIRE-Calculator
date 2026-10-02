import { describe, expect, it } from "vitest";

import { MAX_RATE_GAP_DAYS, referenceRateOn, toEur, type ReferenceRates } from "./fx-reference.js";

const rates: ReferenceRates = {
  USD: [
    { date: "2024-03-27", unitsPerEur: 1.0816 },
    // Jueves Santo; viernes 29 y lunes 1 de abril sin publicación (TARGET2 cerrado).
    { date: "2024-03-28", unitsPerEur: 1.0811 },
    { date: "2024-04-02", unitsPerEur: 1.0745 },
  ],
  CHF: [],
};

describe("referenceRateOn", () => {
  it("el euro vale 1 sin necesitar serie", () => {
    expect(referenceRateOn({}, "EUR", "2024-01-01")).toEqual({ currency: "EUR", unitsPerEur: 1, date: "2024-01-01" });
  });

  it("usa la publicación del mismo día", () => {
    expect(referenceRateOn(rates, "USD", "2024-04-02")).toEqual({
      currency: "USD",
      unitsPerEur: 1.0745,
      date: "2024-04-02",
    });
  });

  it("en festivos y fines de semana usa la última publicación anterior", () => {
    expect(referenceRateOn(rates, "USD", "2024-03-29")?.date).toBe("2024-03-28");
    expect(referenceRateOn(rates, "USD", "2024-04-01")?.date).toBe("2024-03-28");
  });

  it("nunca usa una publicación posterior", () => {
    expect(referenceRateOn(rates, "USD", "2024-03-26")).toBeNull();
  });

  it("sin serie o con serie vacía no hay tipo", () => {
    expect(referenceRateOn(rates, "GBP", "2024-04-02")).toBeNull();
    expect(referenceRateOn(rates, "CHF", "2024-04-02")).toBeNull();
  });

  it(`a más de ${MAX_RATE_GAP_DAYS} días de la última publicación falta la serie, no es un festivo`, () => {
    expect(referenceRateOn(rates, "USD", "2024-04-09")?.date).toBe("2024-04-02");
    expect(referenceRateOn(rates, "USD", "2024-04-10")).toBeNull();
  });

  it("descarta tipos no finitos o no positivos", () => {
    const bad: ReferenceRates = {
      USD: [{ date: "2024-01-02", unitsPerEur: 0 }],
      JPY: [{ date: "2024-01-02", unitsPerEur: NaN }],
    };
    expect(referenceRateOn(bad, "USD", "2024-01-02")).toBeNull();
    expect(referenceRateOn(bad, "JPY", "2024-01-02")).toBeNull();
  });
});

describe("toEur", () => {
  it("divide por las unidades por euro", () => {
    expect(toEur(108.11, { currency: "USD", unitsPerEur: 1.0811, date: "2024-03-28" })).toBeCloseTo(100, 10);
    expect(toEur(0, { currency: "USD", unitsPerEur: 1.0811, date: "2024-03-28" })).toBe(0);
  });
});
