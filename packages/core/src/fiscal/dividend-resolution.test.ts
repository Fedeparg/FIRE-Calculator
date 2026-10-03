import { describe, expect, it } from "vitest";

import {
  estimateWithStatutoryRate,
  resolveFromBroker,
  resolveWithMarket,
  type DividendFacts,
} from "./dividend-resolution.js";

const facts = (overrides: Partial<DividendFacts>): DividendFacts => ({
  amount: 1,
  tax: 0,
  originalAmount: null,
  reported: true,
  country: "US",
  ...overrides,
});

// Casos reales comprobados contra los informes fiscales de Trade Republic de 2025.
describe("resolveFromBroker", () => {
  it("EE. UU. tras la sucursal española: `tax` suma origen y España (Meta 0,46 → 0,07 + 0,07)", () => {
    expect(resolveFromBroker(facts({ amount: 0.46, tax: 0.14 }))).toEqual({
      gross: 0.46,
      origin: 0.07,
      spain: 0.07,
      grossSource: "broker",
      originSource: "derived",
    });
  });

  it("antes de la sucursal española `tax` es la retención en origen (Apple 0,11 → 0,02)", () => {
    expect(resolveFromBroker(facts({ amount: 0.11, tax: 0.02, reported: false }))).toMatchObject({
      gross: 0.11,
      origin: 0.02,
      spain: 0,
      originSource: "broker",
    });
  });

  it("Países Bajos neto de origen: deshacerlo con el 15 % es una estimación (ASML 1,36 → 1,60)", () => {
    expect(resolveFromBroker(facts({ amount: 1.36, tax: 0.26, country: "NL" }))).toEqual({
      gross: 1.6,
      origin: 0.24,
      spain: 0.26,
      grossSource: "estimate",
      originSource: "estimate",
    });
  });

  it("de un país sin tipo conocido no deduce el origen", () => {
    expect(resolveFromBroker(facts({ amount: 0.35, tax: 0.07, country: "CN" }))).toMatchObject({
      gross: 0.35,
      origin: null,
      spain: 0.07,
      originSource: null,
    });
    expect(resolveFromBroker(facts({ amount: 1.44, country: "CN", reported: false })).origin).toBeNull();
  });

  it("un dividendo español no tiene retención en origen", () => {
    expect(resolveFromBroker(facts({ amount: 10, tax: 1.9, country: "ES" }))).toMatchObject({ origin: 0, spain: 1.9 });
  });

  it("un importe diminuto sin retención tiene origen 0 deducido", () => {
    expect(resolveFromBroker(facts({ amount: 0.01 }))).toMatchObject({ origin: 0, originSource: "derived" });
  });

  it("lo que no encaja queda sin origen y la española no pasa del 19 % de lo cobrado", () => {
    expect(resolveFromBroker(facts({ amount: 10, tax: 2.5 }))).toMatchObject({ origin: null, spain: 1.9 });
  });
});

describe("resolveWithMarket", () => {
  it("si el dato de mercado es mayor que lo abonado, la diferencia es la retención en origen (ASML)", () => {
    // 1 acción × 1,60 € de dividendo por acción, abonados 1,36.
    expect(resolveWithMarket(facts({ amount: 1.36, tax: 0.26, country: "NL" }), 1.6)).toEqual({
      gross: 1.6,
      origin: 0.24,
      spain: 0.26,
      grossSource: "market",
      originSource: "market",
    });
  });

  it("compara en la divisa de pago y pasa a euros con el cambio del bróker (Suiza al 35 %)", () => {
    // 10 acciones × 3,05 CHF = 30,50 CHF íntegros; abonados 19,83 CHF = 21,10 € (1 CHF = 1,0640 €).
    const result = resolveWithMarket(
      facts({ amount: 21.1, originalAmount: 19.83, tax: 0, reported: false, country: "CH" }),
      30.5,
    );
    expect(result).toMatchObject({ grossSource: "market", originSource: "market", spain: 0 });
    expect(result?.gross).toBeCloseTo(32.45, 2);
    expect(result?.origin).toBeCloseTo(11.35, 2);
  });

  it("si el dato de mercado coincide con lo abonado, el íntegro es el del bróker y sin más retención el origen es 0", () => {
    expect(resolveWithMarket(facts({ amount: 5, tax: 0, reported: false, country: "GB" }), 5)).toMatchObject({
      gross: 5,
      origin: 0,
      originSource: "market",
    });
  });

  it("mantiene lo que ya resolvía el bróker cuando el dato de mercado lo confirma", () => {
    expect(resolveWithMarket(facts({ amount: 0.46, tax: 0.14 }), 0.46)).toMatchObject({
      origin: 0.07,
      originSource: "derived",
    });
  });

  it("descarta un dato de mercado menor que lo abonado o que implicaría una retención inverosímil", () => {
    expect(resolveWithMarket(facts({ amount: 1.36, tax: 0.26, country: "NL" }), 1.2)).toBeNull();
    expect(resolveWithMarket(facts({ amount: 1, tax: 0, country: "NL" }), 3)).toBeNull();
    expect(resolveWithMarket(facts({ amount: 1 }), 0)).toBeNull();
  });
});

describe("estimateWithStatutoryRate", () => {
  it("supone que lo abonado llegó neto del tipo legal y lo marca como estimación", () => {
    expect(estimateWithStatutoryRate(facts({ amount: 0.9, tax: 0, reported: false, country: "CN" }), 0.1)).toEqual({
      gross: 1,
      origin: 0.1,
      spain: 0,
      grossSource: "estimate",
      originSource: "estimate",
    });
  });
});
