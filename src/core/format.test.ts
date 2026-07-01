import { describe, expect, it } from "vitest";
import { formatCurrency, formatQuantity } from "./format";

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

describe("formatQuantity", () => {
  it("conserva los decimales de la cantidad (no redondea a entero)", () => {
    // El caso real que motivó el fix: 1368,8 participaciones no debe redondear a 1369.
    // El ICU de Node en test no agrupa miles (igual que el test de formatCurrency), así
    // que lo estable aquí es la coma decimal y que se conserven los decimales.
    expect(formatQuantity(1368.8)).toBe("1368,8");
    // Fracciones < 1 (p. ej. cripto) no deben colapsar a "0".
    expect(formatQuantity(0.5)).toBe("0,5");
    expect(formatQuantity(0.00123456)).toBe("0,001235");
  });

  it("muestra un entero sin decimales superfluos", () => {
    expect(formatQuantity(1369)).toBe("1369");
    expect(formatQuantity(0)).toBe("0");
  });

  it("limita a 6 decimales (la precisión con la que se almacena)", () => {
    // numeric(18,6): más allá de 6 decimales se redondea, no se inventa precisión.
    expect(formatQuantity(1.2345678)).toBe("1,234568");
  });

  it("devuelve el marcador '—' para valores no finitos", () => {
    expect(formatQuantity(Number.NaN)).toBe("—");
    expect(formatQuantity(Number.POSITIVE_INFINITY)).toBe("—");
  });
});
