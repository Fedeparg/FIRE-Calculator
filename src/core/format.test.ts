import { describe, expect, it } from "vitest";
import { formatCurrency } from "./format";

describe("formatCurrency", () => {
  it("usa separadores es-ES (coma decimal) y dos decimales", () => {
    // El símbolo va separado por un espacio fino que varía según el ICU; lo estable
    // es la coma decimal, los dos decimales y el símbolo de euro.
    expect(formatCurrency(1234.5, "EUR")).toMatch(/^1234,50\s?€$/u);
    expect(formatCurrency(5, "EUR")).toMatch(/^5,00\s?€$/u);
  });

  it("formatea el importe en la divisa indicada", () => {
    // El símbolo exacto depende del ICU; lo estable es el importe con coma decimal.
    expect(formatCurrency(1000, "USD")).toContain("1000,00");
    expect(formatCurrency(99.9, "GBP")).toContain("99,90");
  });

  it("devuelve el marcador '—' para valores no finitos", () => {
    expect(formatCurrency(Number.NaN, "EUR")).toBe("—");
    expect(formatCurrency(Number.POSITIVE_INFINITY, "USD")).toBe("—");
  });
});
