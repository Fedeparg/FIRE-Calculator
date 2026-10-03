import { describe, expect, it } from "vitest";

import { firstItem, itemAt, lastItem, takeItems } from "./arrays.js";

describe("itemAt", () => {
  it("returns the item if the index is in range, also on typed arrays", () => {
    expect(itemAt(["a", "b"], 1)).toBe("b");
    expect(itemAt(new Float64Array([1.5, 2.5]), 0)).toBe(1.5);
  });

  it("keeps an undefined that is a real value of the list", () => {
    expect(itemAt([undefined, 1], 0)).toBeUndefined();
  });

  it("throws RangeError when out of range or given a non-integer index", () => {
    expect(() => itemAt([1], 1)).toThrow(RangeError);
    expect(() => itemAt([1], -1)).toThrow(RangeError);
    expect(() => itemAt([1], 0.5)).toThrow(RangeError);
    expect(() => itemAt([], 0)).toThrow(RangeError);
  });
});

describe("firstItem / lastItem", () => {
  it("return the first and the last item", () => {
    expect(firstItem([3, 4, 5])).toBe(3);
    expect(lastItem([3, 4, 5])).toBe(5);
  });

  it("throw on an empty list", () => {
    expect(() => firstItem([])).toThrow(RangeError);
    expect(() => lastItem([])).toThrow(RangeError);
  });
});

describe("takeItems", () => {
  it("returns the first items as a tuple", () => {
    const [a, b] = takeItems([1, 2, 3], 2);
    expect([a, b]).toEqual([1, 2]);
  });

  it("throws if the list has fewer items than requested", () => {
    expect(() => takeItems([1], 2)).toThrow(RangeError);
  });
});
