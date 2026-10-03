import { describe, expect, it } from "vitest";

import { validateIncomeForm, validateLotForm, validatePendingBalances, validatePositionForm } from "./form-validation";

describe("validatePositionForm", () => {
  it("acepta coma o punto y precio 0", () => {
    expect(validatePositionForm({ ticker: " IWDA ", quantity: "1,5", avgPrice: "0" })).toEqual({
      quantity: 1.5,
      avgPrice: 0,
    });
  });

  it("exige símbolo, cantidad positiva y precio no negativo", () => {
    expect(validatePositionForm({ ticker: " ", quantity: "1", avgPrice: "1" })).toBeNull();
    expect(validatePositionForm({ ticker: "A", quantity: "0", avgPrice: "1" })).toBeNull();
    expect(validatePositionForm({ ticker: "A", quantity: "1", avgPrice: "-1" })).toBeNull();
    expect(validatePositionForm({ ticker: "A", quantity: "", avgPrice: "1" })).toBeNull();
  });
});

describe("validateLotForm", () => {
  const base = { quantity: "2", price: "10,5", fees: "", tradedAt: "2025-03-01" };

  it("las comisiones vacías son 0", () => {
    expect(validateLotForm(base)).toEqual({ quantity: 2, price: 10.5, fees: 0 });
    expect(validateLotForm({ ...base, fees: "1,25" })).toEqual({ quantity: 2, price: 10.5, fees: 1.25 });
  });

  it("rechaza cantidad 0, importes negativos o sin número y fechas incompletas", () => {
    expect(validateLotForm({ ...base, quantity: "0" })).toBeNull();
    expect(validateLotForm({ ...base, price: "-1" })).toBeNull();
    expect(validateLotForm({ ...base, fees: "-" })).toBeNull();
    expect(validateLotForm({ ...base, tradedAt: "2025-3-1" })).toBeNull();
  });
});

describe("validateIncomeForm", () => {
  const base = { gross: "100", origin: "15", spain: "12,75", country: "us", paidAt: "2025-06-01" };

  it("normaliza el país y deja la retención en origen vacía como desconocida", () => {
    expect(validateIncomeForm(base)).toEqual({
      ok: true,
      value: { gross: 100, withholdingOrigin: 15, withholdingSpain: 12.75, country: "US" },
    });
    expect(validateIncomeForm({ ...base, origin: "", spain: "", country: "" })).toEqual({
      ok: true,
      value: { gross: 100, withholdingOrigin: null, withholdingSpain: 0, country: null },
    });
  });

  it("acepta retenciones que suman exactamente el íntegro (sin errores de coma flotante)", () => {
    expect(validateIncomeForm({ ...base, gross: "0,3", origin: "0,1", spain: "0,2" }).ok).toBe(true);
  });

  it("avisa (inconsistent) cuando los números valen pero el conjunto no cuadra", () => {
    expect(validateIncomeForm({ ...base, origin: "60", spain: "50" })).toEqual({ ok: false, reason: "inconsistent" });
    expect(validateIncomeForm({ ...base, country: "USA" })).toEqual({ ok: false, reason: "inconsistent" });
  });

  it("no avisa mientras falta algo por teclear (incomplete)", () => {
    expect(validateIncomeForm({ ...base, gross: "" })).toEqual({ ok: false, reason: "incomplete" });
    expect(validateIncomeForm({ ...base, spain: "-" })).toEqual({ ok: false, reason: "incomplete" });
  });
});

describe("validatePendingBalances", () => {
  it("devuelve los importes en orden si todo vale", () => {
    expect(
      validatePendingBalances([
        { originYear: 2021, kind: "gains", amount: "100" },
        { originYear: 2021, kind: "capitalIncome", amount: "1,5" },
      ]),
    ).toEqual({ duplicated: false, amounts: [100, 1.5] });
  });

  it("marca los ejercicios y tipos repetidos y rechaza importes no positivos", () => {
    expect(
      validatePendingBalances([
        { originYear: 2021, kind: "gains", amount: "1" },
        { originYear: 2021, kind: "gains", amount: "2" },
      ]),
    ).toEqual({ duplicated: true, amounts: null });
    expect(validatePendingBalances([{ originYear: 2021, kind: "gains", amount: "0" }])).toEqual({
      duplicated: false,
      amounts: null,
    });
  });
});
