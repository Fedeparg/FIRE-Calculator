import { describe, expect, it } from "vitest";

import { defined } from "./assert.js";

describe("defined", () => {
  it("devuelve el valor, también los falsy que no son null ni undefined", () => {
    expect(defined(0)).toBe(0);
    expect(defined("")).toBe("");
    expect(defined(false)).toBe(false);
  });

  it("lanza con null o undefined y nombra lo que faltaba", () => {
    expect(() => defined(null, "la venta simulada")).toThrow("Se esperaba la venta simulada");
    expect(() => defined(undefined)).toThrow(Error);
  });
});
