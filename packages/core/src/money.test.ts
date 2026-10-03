import { describe, expect, it } from "vitest";

import { formatTaxBox, roundCents } from "./money.js";

describe("roundCents", () => {
  it("redondea a céntimos y quita el ruido binario", () => {
    expect(roundCents(1.239)).toBe(1.24);
    expect(roundCents(0.1 + 0.2)).toBe(0.3);
    expect(roundCents(1999.9999999999998)).toBe(2000);
    expect(roundCents(10)).toBe(10);
    expect(roundCents(0)).toBe(0);
    expect(roundCents(-2.345)).toBe(-2.35);
  });

  it("fija el método actual: hereda el sesgo binario de x * 100", () => {
    // 1.005 * 100 = 100.49999999999999 en binario: cambiar esto es un cambio de comportamiento.
    expect(roundCents(1.005)).toBe(1);
  });
});

describe("formatTaxBox", () => {
  it("da dos decimales con coma y sin separador de miles", () => {
    expect(formatTaxBox(1234.5)).toBe("1234,50");
    expect(formatTaxBox(0)).toBe("0,00");
    expect(formatTaxBox(-12.345)).toBe("-12,35");
  });
});
