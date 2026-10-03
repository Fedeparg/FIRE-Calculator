import { describe, expect, it } from "vitest";

import {
  addStep,
  clampNumber,
  formatDecimalInput,
  parseDecimalInput,
  sanitizeDecimalInput,
  stripLeadingZeros,
} from "./number-input";

describe("sanitizeDecimalInput", () => {
  it("keeps the separator the user types", () => {
    expect(sanitizeDecimalInput("3,5")).toBe("3,5");
    expect(sanitizeDecimalInput("3.5")).toBe("3.5");
  });

  it("drops characters that are not part of a decimal", () => {
    expect(sanitizeDecimalInput("3a5")).toBe("35");
    expect(sanitizeDecimalInput("12 €")).toBe("12");
    expect(sanitizeDecimalInput("abc")).toBe("");
  });

  it("with several separators the last one wins; earlier ones are thousands", () => {
    expect(sanitizeDecimalInput("3,5,7")).toBe("35,7");
    expect(sanitizeDecimalInput("1.2.3")).toBe("12.3");
    expect(sanitizeDecimalInput("1,2.3")).toBe("12.3");
  });

  it("reads a pasted amount in Spanish or English format", () => {
    expect(sanitizeDecimalInput("1.234,56")).toBe("1234,56");
    expect(sanitizeDecimalInput("1,234.56")).toBe("1234.56");
    expect(parseDecimalInput("1.234,56")).toBe(1234.56);
    expect(parseDecimalInput("1,234.56")).toBe(1234.56);
  });

  it("keeps the sign only at the start", () => {
    expect(sanitizeDecimalInput("-3,5")).toBe("-3,5");
    expect(sanitizeDecimalInput("3-5")).toBe("35");
    expect(sanitizeDecimalInput("--3")).toBe("-3");
  });

  it("tolerates intermediate typing states", () => {
    expect(sanitizeDecimalInput("")).toBe("");
    expect(sanitizeDecimalInput("-")).toBe("-");
    expect(sanitizeDecimalInput(",")).toBe(",");
    expect(sanitizeDecimalInput("3,")).toBe("3,");
  });
});

describe("parseDecimalInput", () => {
  it("parses a comma the same as a point", () => {
    expect(parseDecimalInput("3,5")).toBe(3.5);
    expect(parseDecimalInput("3.5")).toBe(3.5);
    expect(parseDecimalInput("0,5")).toBe(0.5);
  });

  it("accepts a trailing or leading separator", () => {
    expect(parseDecimalInput("3,")).toBe(3);
    expect(parseDecimalInput(",5")).toBe(0.5);
    expect(parseDecimalInput("-,5")).toBe(-0.5);
  });

  it("returns null while there is no digit", () => {
    expect(parseDecimalInput("")).toBeNull();
    expect(parseDecimalInput("-")).toBeNull();
    expect(parseDecimalInput(",")).toBeNull();
    expect(parseDecimalInput(".")).toBeNull();
    expect(parseDecimalInput("abc")).toBeNull();
  });

  it("parses negatives and zeros", () => {
    expect(parseDecimalInput("-3,5")).toBe(-3.5);
    expect(parseDecimalInput("0")).toBe(0);
    expect(parseDecimalInput("0,0")).toBe(0);
  });
});

describe("formatDecimalInput", () => {
  it("writes the number with the locale's separator", () => {
    expect(formatDecimalInput(4.25, ",")).toBe("4,25");
    expect(formatDecimalInput(4.25, ".")).toBe("4.25");
  });

  it("leaves integers untouched", () => {
    expect(formatDecimalInput(7, ",")).toBe("7");
    expect(formatDecimalInput(0, ",")).toBe("0");
  });

  it("adds no thousands separator, which would get in the way of further typing", () => {
    expect(formatDecimalInput(1234.5, ",")).toBe("1234,5");
  });

  it("is the inverse of parseDecimalInput", () => {
    expect(parseDecimalInput(formatDecimalInput(-3.5, ","))).toBe(-3.5);
    expect(parseDecimalInput(formatDecimalInput(0.25, ","))).toBe(0.25);
  });

  it("never uses scientific notation, which re-sanitizing would corrupt", () => {
    // String(1e-7) === "1e-7" and sanitizing it would give "17".
    expect(formatDecimalInput(1e-7, ",")).toBe("0,0000001");
    expect(formatDecimalInput(1e21, ",")).toBe("1000000000000000000000");
    expect(sanitizeDecimalInput(formatDecimalInput(1e-7, ","))).toBe("0,0000001");
    expect(parseDecimalInput(formatDecimalInput(1e-7, ","))).toBe(1e-7);
  });

  it("does not propagate non-finite values or negative zero", () => {
    expect(formatDecimalInput(Number.NaN, ",")).toBe("");
    expect(formatDecimalInput(Number.POSITIVE_INFINITY, ",")).toBe("");
    expect(formatDecimalInput(-0, ",")).toBe("0");
  });
});

describe("stripLeadingZeros", () => {
  it("strips leading zeros", () => {
    expect(stripLeadingZeros("0300")).toBe("300");
    expect(stripLeadingZeros("007")).toBe("7");
  });

  it("keeps a lone zero and the zero before decimals", () => {
    expect(stripLeadingZeros("0")).toBe("0");
    expect(stripLeadingZeros("0,5")).toBe("0,5");
    expect(stripLeadingZeros("0.5")).toBe("0.5");
    expect(stripLeadingZeros("00,5")).toBe("0,5");
  });

  it("keeps the negative sign", () => {
    expect(stripLeadingZeros("-007")).toBe("-7");
    expect(stripLeadingZeros("-0,5")).toBe("-0,5");
  });
});

describe("clampNumber", () => {
  it("clamps to the defined bounds", () => {
    expect(clampNumber(150, 0, 100)).toBe(100);
    expect(clampNumber(-5, 0, 100)).toBe(0);
    expect(clampNumber(50, 0, 100)).toBe(50);
  });

  it("ignores undefined bounds", () => {
    expect(clampNumber(-5)).toBe(-5);
    expect(clampNumber(1e9, 0)).toBe(1e9);
    expect(clampNumber(-5, undefined, 100)).toBe(-5);
  });
});

describe("addStep", () => {
  it("does not carry floating-point binary noise", () => {
    expect(addStep(0.1, 0.2)).toBe(0.3);
    expect(addStep(2.9, 0.1)).toBe(3);
    expect(addStep(0.3, -0.1)).toBe(0.2);
  });

  it("adds integers", () => {
    expect(addStep(1000, 1000)).toBe(2000);
    expect(addStep(5, -1)).toBe(4);
  });
});
