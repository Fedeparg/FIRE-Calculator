import { describe, expect, it } from "vitest";

import { validateIncomeForm, validateLotForm, validatePendingBalances, validatePositionForm } from "./form-validation";

describe("validatePositionForm", () => {
  it("accepts comma or dot and a price of 0", () => {
    expect(validatePositionForm({ ticker: " IWDA ", quantity: "1,5", avgPrice: "0" })).toEqual({
      quantity: 1.5,
      avgPrice: 0,
    });
  });

  it("requires a symbol, a positive quantity and a non-negative price", () => {
    expect(validatePositionForm({ ticker: " ", quantity: "1", avgPrice: "1" })).toBeNull();
    expect(validatePositionForm({ ticker: "A", quantity: "0", avgPrice: "1" })).toBeNull();
    expect(validatePositionForm({ ticker: "A", quantity: "1", avgPrice: "-1" })).toBeNull();
    expect(validatePositionForm({ ticker: "A", quantity: "", avgPrice: "1" })).toBeNull();
  });
});

describe("validateLotForm", () => {
  const base = { quantity: "2", price: "10,5", fees: "", tradedAt: "2025-03-01" };

  it("empty fees are 0", () => {
    expect(validateLotForm(base)).toEqual({ quantity: 2, price: 10.5, fees: 0 });
    expect(validateLotForm({ ...base, fees: "1,25" })).toEqual({ quantity: 2, price: 10.5, fees: 1.25 });
  });

  it("rejects zero quantity, negative or non-numeric amounts and incomplete dates", () => {
    expect(validateLotForm({ ...base, quantity: "0" })).toBeNull();
    expect(validateLotForm({ ...base, price: "-1" })).toBeNull();
    expect(validateLotForm({ ...base, fees: "-" })).toBeNull();
    expect(validateLotForm({ ...base, tradedAt: "2025-3-1" })).toBeNull();
  });
});

describe("validateIncomeForm", () => {
  const base = { gross: "100", origin: "15", spain: "12,75", country: "us", paidAt: "2025-06-01" };

  it("normalizes the country and treats an empty withholding at source as unknown", () => {
    expect(validateIncomeForm(base)).toEqual({
      ok: true,
      value: { gross: 100, withholdingOrigin: 15, withholdingSpain: 12.75, country: "US" },
    });
    expect(validateIncomeForm({ ...base, origin: "", spain: "", country: "" })).toEqual({
      ok: true,
      value: { gross: 100, withholdingOrigin: null, withholdingSpain: 0, country: null },
    });
  });

  it("accepts withholdings that add up exactly to the gross amount (no floating-point errors)", () => {
    expect(validateIncomeForm({ ...base, gross: "0,3", origin: "0,1", spain: "0,2" }).ok).toBe(true);
  });

  it("warns (inconsistent) when the numbers are valid but the whole does not add up", () => {
    expect(validateIncomeForm({ ...base, origin: "60", spain: "50" })).toEqual({ ok: false, reason: "inconsistent" });
    expect(validateIncomeForm({ ...base, country: "USA" })).toEqual({ ok: false, reason: "inconsistent" });
  });

  it("does not warn while something is still being typed (incomplete)", () => {
    expect(validateIncomeForm({ ...base, gross: "" })).toEqual({ ok: false, reason: "incomplete" });
    expect(validateIncomeForm({ ...base, spain: "-" })).toEqual({ ok: false, reason: "incomplete" });
  });
});

describe("validatePendingBalances", () => {
  it("returns the amounts in order if everything is valid", () => {
    expect(
      validatePendingBalances([
        { originYear: 2021, kind: "gains", amount: "100" },
        { originYear: 2021, kind: "capitalIncome", amount: "1,5" },
      ]),
    ).toEqual({ duplicated: false, amounts: [100, 1.5] });
  });

  it("flags repeated years and types and rejects non-positive amounts", () => {
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
