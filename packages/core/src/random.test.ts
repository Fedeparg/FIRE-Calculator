import { describe, expect, it } from "vitest";
import { mulberry32, normalGenerator, percentileSorted } from "./random.js";

describe("mulberry32", () => {
  it("la misma semilla produce la misma secuencia", () => {
    const a = mulberry32(123);
    const b = mulberry32(123);
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
  });

  it("semillas distintas producen secuencias distintas", () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    const same = Array.from({ length: 20 }, () => a() === b()).every(Boolean);
    expect(same).toBe(false);
  });

  it("genera valores en [0, 1) con media ≈ 0,5", () => {
    const rng = mulberry32(7);
    let sum = 0;
    const n = 100_000;
    for (let i = 0; i < n; i++) {
      const u = rng();
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThan(1);
      sum += u;
    }
    expect(sum / n).toBeCloseTo(0.5, 2);
  });
});

describe("normalGenerator", () => {
  it("tiene media ≈ 0 y varianza ≈ 1", () => {
    const normal = normalGenerator(mulberry32(99));
    const n = 200_000;
    let sum = 0;
    let sumSq = 0;
    for (let i = 0; i < n; i++) {
      const z = normal();
      expect(Number.isFinite(z)).toBe(true);
      sum += z;
      sumSq += z * z;
    }
    const mean = sum / n;
    expect(mean).toBeCloseTo(0, 2);
    expect(sumSq / n - mean * mean).toBeCloseTo(1, 1);
  });

  it("es reproducible con la misma semilla", () => {
    const a = normalGenerator(mulberry32(5));
    const b = normalGenerator(mulberry32(5));
    for (let i = 0; i < 50; i++) expect(a()).toBe(b());
  });
});

describe("percentileSorted", () => {
  it("interpola linealmente entre rangos", () => {
    const sorted = [10, 20, 30, 40, 50];
    expect(percentileSorted(sorted, 0)).toBe(10);
    expect(percentileSorted(sorted, 50)).toBe(30);
    expect(percentileSorted(sorted, 100)).toBe(50);
    expect(percentileSorted(sorted, 25)).toBe(20);
    expect(percentileSorted(sorted, 10)).toBeCloseTo(14);
  });

  it("acota p fuera de [0, 100]", () => {
    expect(percentileSorted([1, 2, 3], -5)).toBe(1);
    expect(percentileSorted([1, 2, 3], 500)).toBe(3);
  });

  it("muestra vacía → NaN; un único valor → ese valor", () => {
    expect(percentileSorted([], 50)).toBeNaN();
    expect(percentileSorted([7], 90)).toBe(7);
  });
});
