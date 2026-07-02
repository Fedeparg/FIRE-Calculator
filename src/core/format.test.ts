import { describe, expect, it } from "vitest";
import { getFormatters } from "./format";

const es = getFormatters("es");
const en = getFormatters("en");

describe("formatCurrency", () => {
  it("usa separadores es-ES (coma decimal) y dos decimales", () => {
    // El símbolo va separado por un espacio fino que varía según el ICU; lo estable
    // es la coma decimal, los dos decimales y el símbolo de euro.
    expect(es.formatCurrency(1234.5, "EUR")).toMatch(/^1234,50\s?€$/u);
    expect(es.formatCurrency(5, "EUR")).toMatch(/^5,00\s?€$/u);
  });

  it("aplica la agrupación de miles según el idioma", () => {
    // Regla española (RAE/CLDR): las cifras de 4 dígitos NO llevan separador de miles,
    // pero sí a partir de 5 (10.000). Es el núcleo de la localización del formato.
    expect(es.formatCurrency(2000, "EUR")).toContain("2000,00");
    expect(es.formatCurrency(12345, "EUR")).toContain("12.345,00");
    // Inglés (en-GB): agrupa SIEMPRE desde 4 dígitos, coma para miles y punto decimal.
    expect(en.formatCurrency(2000, "EUR")).toContain("2,000.00");
    expect(en.formatCurrency(12345, "EUR")).toContain("12,345.00");
  });

  it("formatea el importe en la divisa indicada", () => {
    // El símbolo exacto depende del ICU; lo estable es el importe con su separador decimal.
    expect(es.formatCurrency(1000, "USD")).toContain("1000,00");
    expect(es.formatCurrency(99.9, "GBP")).toContain("99,90");
    expect(en.formatCurrency(99.9, "GBP")).toContain("99.90");
  });

  it("devuelve el marcador '—' para valores no finitos en ambos idiomas", () => {
    expect(es.formatCurrency(Number.NaN, "EUR")).toBe("—");
    expect(en.formatCurrency(Number.POSITIVE_INFINITY, "USD")).toBe("—");
  });
});

describe("formatQuantity", () => {
  it("conserva los decimales de la cantidad (no redondea a entero)", () => {
    // El caso real que motivó el fix: 1368,8 participaciones no debe redondear a 1369.
    expect(es.formatQuantity(1368.8)).toBe("1368,8");
    // Fracciones < 1 (p. ej. cripto) no deben colapsar a "0".
    expect(es.formatQuantity(0.5)).toBe("0,5");
    expect(es.formatQuantity(0.00123456)).toBe("0,001235");
  });

  it("muestra un entero sin decimales superfluos", () => {
    expect(es.formatQuantity(1369)).toBe("1369");
    expect(es.formatQuantity(0)).toBe("0");
  });

  it("limita a 6 decimales (la precisión con la que se almacena)", () => {
    // numeric(18,6): más allá de 6 decimales se redondea, no se inventa precisión.
    expect(es.formatQuantity(1.2345678)).toBe("1,234568");
  });

  it("devuelve el marcador '—' para valores no finitos", () => {
    expect(es.formatQuantity(Number.NaN)).toBe("—");
    expect(es.formatQuantity(Number.POSITIVE_INFINITY)).toBe("—");
  });
});

describe("formatPercent", () => {
  it("recibe base 100 y usa el separador decimal del idioma", () => {
    expect(es.formatPercent(7)).toMatch(/^7\s?%$/u);
    expect(es.formatPercent(3.25)).toMatch(/^3,25\s?%$/u);
    expect(en.formatPercent(3.25)).toMatch(/^3\.25%$/u);
  });
});
