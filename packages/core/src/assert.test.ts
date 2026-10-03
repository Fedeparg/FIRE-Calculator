import { describe, expect, it } from "vitest";

import { defined } from "./assert.js";

describe("defined", () => {
  it("returns the value, including falsy values that are neither null nor undefined", () => {
    expect(defined(0)).toBe(0);
    expect(defined("")).toBe("");
    expect(defined(false)).toBe(false);
  });

  it("throws on null or undefined and names what was missing", () => {
    expect(() => defined(null, "the simulated sale")).toThrow("Expected the simulated sale");
    expect(() => defined(undefined)).toThrow(Error);
  });
});
