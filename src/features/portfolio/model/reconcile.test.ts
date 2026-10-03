import { describe, expect, it } from "vitest";

import { reconcileList, reconcileRecord } from "./reconcile";

const a = { id: "a", quantity: 1, name: "A" };
const b = { id: "b", quantity: 2, name: "B" };

describe("reconcileList", () => {
  it("returns the same list if content and order are unchanged", () => {
    const prev = [a, b];
    expect(reconcileList(prev, [{ ...a }, { ...b }])).toBe(prev);
  });

  it("keeps the unchanged items and replaces the changed ones", () => {
    const prev = [a, b];
    const next = reconcileList(prev, [{ ...a }, { ...b, quantity: 3 }]);

    expect(next).not.toBe(prev);
    expect(next[0]).toBe(a);
    expect(next[1]).toEqual({ ...b, quantity: 3 });
  });

  it("detects additions, removals and reordering", () => {
    const prev = [a, b];
    expect(reconcileList(prev, [{ ...b }, { ...a }])).toEqual([b, a]);
    expect(reconcileList(prev, [{ ...b }, { ...a }])[0]).toBe(b);
    expect(reconcileList(prev, [{ ...a }])).toEqual([a]);
    expect(reconcileList(prev, [{ ...a }, { ...b }, { id: "c", quantity: 0, name: "C" }])).toHaveLength(3);
  });
});

describe("reconcileRecord", () => {
  const p = { close: 10, date: "2026-10-01" };

  it("returns the same dictionary if no entry changes", () => {
    const prev = { X: p };
    expect(reconcileRecord(prev, { X: { ...p } })).toBe(prev);
  });

  it("keeps equal entries and detects changes, additions and removals", () => {
    const prev = { X: p, Y: { close: 5, date: "2026-10-01" } };
    const next = reconcileRecord(prev, { X: { ...p }, Y: { close: 6, date: "2026-10-01" } });

    expect(next).not.toBe(prev);
    expect(next.X).toBe(p);
    expect(next.Y?.close).toBe(6);
    expect(reconcileRecord(prev, { X: { ...p } })).toEqual({ X: p });
    expect(reconcileRecord({ X: p }, { X: { ...p }, Z: { ...p } })).toHaveProperty("Z");
  });
});
