import { describe, expect, it } from "vitest";

import { defaultTaxYear, taxYears } from "./tax-year";

describe("taxYears", () => {
  it("sorts from most recent to oldest without duplicates", () => {
    expect(taxYears([2023, 2025, 2023, 2024], 2026)).toEqual([2025, 2024, 2023]);
  });

  it("without data offers the current year", () => {
    expect(taxYears([], 2026)).toEqual([2026]);
  });
});

describe("defaultTaxYear", () => {
  it("opens the year being filed now (last year) if it has data", () => {
    expect(defaultTaxYear([2026, 2025, 2024], 2026)).toBe(2025);
  });

  it("if last year has no data, opens the most recent one", () => {
    expect(defaultTaxYear([2026, 2023], 2026)).toBe(2026);
    expect(defaultTaxYear([2024], 2026)).toBe(2024);
  });
});
