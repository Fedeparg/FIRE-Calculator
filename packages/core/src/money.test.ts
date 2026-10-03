import { describe, expect, it } from "vitest";

import { formatTaxBox, roundCents } from "./money.js";

describe("roundCents", () => {
  it("rounds to cents and strips the binary noise", () => {
    expect(roundCents(1.239)).toBe(1.24);
    expect(roundCents(0.1 + 0.2)).toBe(0.3);
    expect(roundCents(1999.9999999999998)).toBe(2000);
    expect(roundCents(10)).toBe(10);
    expect(roundCents(0)).toBe(0);
    expect(roundCents(-2.345)).toBe(-2.35);
  });

  it("pins the current method: it inherits the binary bias of x * 100", () => {
    // 1.005 * 100 = 100.49999999999999 in binary: changing this is a behavior change.
    expect(roundCents(1.005)).toBe(1);
  });
});

describe("formatTaxBox", () => {
  it("gives two decimals with a comma and no thousands separator", () => {
    expect(formatTaxBox(1234.5)).toBe("1234,50");
    expect(formatTaxBox(0)).toBe("0,00");
    expect(formatTaxBox(-12.345)).toBe("-12,35");
  });
});
