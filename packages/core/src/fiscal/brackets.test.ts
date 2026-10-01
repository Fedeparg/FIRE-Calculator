import { describe, expect, it } from "vitest";
import {
  IRPF_AHORRO,
  IRPF_GENERAL,
  applyProgressiveBrackets,
  effectiveRate,
  marginalRate,
  type Bracket,
} from "./brackets.js";

const SIMPLE: Bracket[] = [
  { upTo: 100, rate: 10 },
  { upTo: 200, rate: 20 },
  { upTo: null, rate: 30 },
];

describe("applyProgressiveBrackets", () => {
  it("base 0 → cuota 0", () => {
    expect(applyProgressiveBrackets(0, SIMPLE)).toBe(0);
  });

  it("grava solo el primer tramo", () => {
    expect(applyProgressiveBrackets(100, SIMPLE)).toBeCloseTo(10, 6);
  });

  it("reparte la base entre tramos (no todo al tipo máximo)", () => {
    // 100×10% + 100×20% + 50×30% = 10 + 20 + 15 = 45
    expect(applyProgressiveBrackets(250, SIMPLE)).toBeCloseTo(45, 6);
  });

  it("entrada negativa se trata como 0", () => {
    expect(applyProgressiveBrackets(-50, SIMPLE)).toBe(0);
  });

  it("escala del ahorro: 10.000 € → 19%×6000 + 21%×4000", () => {
    expect(applyProgressiveBrackets(10000, IRPF_AHORRO)).toBeCloseTo(1140 + 840, 6);
  });
});

describe("marginalRate", () => {
  it("devuelve el tipo del tramo donde cae la base", () => {
    expect(marginalRate(150, SIMPLE)).toBe(20);
    expect(marginalRate(5000, IRPF_GENERAL)).toBe(19);
    expect(marginalRate(40000, IRPF_GENERAL)).toBe(37);
  });
});

describe("effectiveRate", () => {
  it("base 0 → 0", () => {
    expect(effectiveRate(0, SIMPLE)).toBe(0);
  });

  it("siempre menor o igual que el marginal", () => {
    expect(effectiveRate(250, SIMPLE)).toBeLessThan(marginalRate(250, SIMPLE));
  });
});
