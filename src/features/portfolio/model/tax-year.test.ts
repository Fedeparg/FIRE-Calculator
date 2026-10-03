import { describe, expect, it } from "vitest";

import { defaultTaxYear, taxYears } from "./tax-year";

describe("taxYears", () => {
  it("ordena del más reciente al más antiguo sin repetir", () => {
    expect(taxYears([2023, 2025, 2023, 2024], 2026)).toEqual([2025, 2024, 2023]);
  });

  it("sin datos ofrece el año en curso", () => {
    expect(taxYears([], 2026)).toEqual([2026]);
  });
});

describe("defaultTaxYear", () => {
  it("abre el ejercicio que se declara ahora (el año pasado) si tiene datos", () => {
    expect(defaultTaxYear([2026, 2025, 2024], 2026)).toBe(2025);
  });

  it("si el año pasado no tiene datos, abre el más reciente", () => {
    expect(defaultTaxYear([2026, 2023], 2026)).toBe(2026);
    expect(defaultTaxYear([2024], 2026)).toBe(2024);
  });
});
