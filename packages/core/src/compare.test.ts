import { describe, expect, it } from "vitest";

import { compareStrings } from "./compare.js";

describe("compareStrings", () => {
  it("sorts by code units, not by locale", () => {
    expect(["b", "a", "B", "á"].sort(compareStrings)).toEqual(["B", "a", "b", "á"]);
    expect(compareStrings("2026-01-02", "2026-01-10")).toBeLessThan(0);
    expect(compareStrings("x", "x")).toBe(0);
    expect(compareStrings("y", "x")).toBeGreaterThan(0);
  });
});
