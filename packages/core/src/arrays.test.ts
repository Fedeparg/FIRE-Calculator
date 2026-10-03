import { describe, expect, it } from "vitest";

import { firstItem, itemAt, lastItem, takeItems } from "./arrays.js";

describe("itemAt", () => {
  it("devuelve el elemento si el índice está en rango, también en arrays tipados", () => {
    expect(itemAt(["a", "b"], 1)).toBe("b");
    expect(itemAt(new Float64Array([1.5, 2.5]), 0)).toBe(1.5);
  });

  it("conserva un undefined que es un valor real de la lista", () => {
    expect(itemAt([undefined, 1], 0)).toBeUndefined();
  });

  it("lanza RangeError fuera de rango o con un índice no entero", () => {
    expect(() => itemAt([1], 1)).toThrow(RangeError);
    expect(() => itemAt([1], -1)).toThrow(RangeError);
    expect(() => itemAt([1], 0.5)).toThrow(RangeError);
    expect(() => itemAt([], 0)).toThrow(RangeError);
  });
});

describe("firstItem / lastItem", () => {
  it("devuelven el primero y el último", () => {
    expect(firstItem([3, 4, 5])).toBe(3);
    expect(lastItem([3, 4, 5])).toBe(5);
  });

  it("lanzan con una lista vacía", () => {
    expect(() => firstItem([])).toThrow(RangeError);
    expect(() => lastItem([])).toThrow(RangeError);
  });
});

describe("takeItems", () => {
  it("devuelve los primeros elementos como tupla", () => {
    const [a, b] = takeItems([1, 2, 3], 2);
    expect([a, b]).toEqual([1, 2]);
  });

  it("lanza si la lista tiene menos elementos de los pedidos", () => {
    expect(() => takeItems([1], 2)).toThrow(RangeError);
  });
});
