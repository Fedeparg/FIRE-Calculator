import { describe, expect, it } from "vitest";

import { reconcileList, reconcileRecord } from "./reconcile";

const a = { id: "a", quantity: 1, name: "A" };
const b = { id: "b", quantity: 2, name: "B" };

describe("reconcileList", () => {
  it("devuelve la misma lista si el contenido y el orden no cambian", () => {
    const prev = [a, b];
    expect(reconcileList(prev, [{ ...a }, { ...b }])).toBe(prev);
  });

  it("conserva los elementos que no cambian y sustituye los que sí", () => {
    const prev = [a, b];
    const next = reconcileList(prev, [{ ...a }, { ...b, quantity: 3 }]);

    expect(next).not.toBe(prev);
    expect(next[0]).toBe(a);
    expect(next[1]).toEqual({ ...b, quantity: 3 });
  });

  it("detecta altas, bajas y cambios de orden", () => {
    const prev = [a, b];
    expect(reconcileList(prev, [{ ...b }, { ...a }])).toEqual([b, a]);
    expect(reconcileList(prev, [{ ...b }, { ...a }])[0]).toBe(b);
    expect(reconcileList(prev, [{ ...a }])).toEqual([a]);
    expect(reconcileList(prev, [{ ...a }, { ...b }, { id: "c", quantity: 0, name: "C" }])).toHaveLength(3);
  });
});

describe("reconcileRecord", () => {
  const p = { close: 10, date: "2026-10-01" };

  it("devuelve el mismo diccionario si ninguna entrada cambia", () => {
    const prev = { X: p };
    expect(reconcileRecord(prev, { X: { ...p } })).toBe(prev);
  });

  it("conserva las entradas iguales y detecta cambios, altas y bajas", () => {
    const prev = { X: p, Y: { close: 5, date: "2026-10-01" } };
    const next = reconcileRecord(prev, { X: { ...p }, Y: { close: 6, date: "2026-10-01" } });

    expect(next).not.toBe(prev);
    expect(next.X).toBe(p);
    expect(next.Y.close).toBe(6);
    expect(reconcileRecord(prev, { X: { ...p } })).toEqual({ X: p });
    expect(reconcileRecord({ X: p }, { X: { ...p }, Z: { ...p } })).toHaveProperty("Z");
  });
});
