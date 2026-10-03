import { describe, expect, it } from "vitest";
import { todayUtc } from "../dates.js";
import {
  FISCAL_REVIEW_BY,
  FISCAL_YEAR,
  IRPF_SAVINGS_SCALE,
  IRPF_DEFAULT_REGIONAL_SCALE,
  IRPF_STATE_SCALE,
  IRPF_GENERAL_SCALE,
  GIFT_TAX_STATE_SCALE,
  WEALTH_TAX_STATE_SCALE,
  applyProgressiveBrackets,
  effectiveRate,
  marginalRate,
  type Bracket,
} from "./brackets.js";
import { itemAt } from "../arrays.js";

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
    expect(applyProgressiveBrackets(10000, IRPF_SAVINGS_SCALE)).toBeCloseTo(1140 + 840, 6);
  });
});

describe("marginalRate", () => {
  it("devuelve el tipo del tramo donde cae la base", () => {
    expect(marginalRate(150, SIMPLE)).toBe(20);
    expect(marginalRate(5000, IRPF_GENERAL_SCALE)).toBe(19);
    expect(marginalRate(40000, IRPF_GENERAL_SCALE)).toBe(37);
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

describe.each([
  ["IRPF_GENERAL_SCALE", IRPF_GENERAL_SCALE],
  ["IRPF_STATE_SCALE", IRPF_STATE_SCALE],
  ["IRPF_DEFAULT_REGIONAL_SCALE", IRPF_DEFAULT_REGIONAL_SCALE],
  ["IRPF_SAVINGS_SCALE", IRPF_SAVINGS_SCALE],
  ["WEALTH_TAX_STATE_SCALE", WEALTH_TAX_STATE_SCALE],
  ["GIFT_TAX_STATE_SCALE", GIFT_TAX_STATE_SCALE],
] as const)("límites de tramo de %s", (_name, scale) => {
  const CENT = 0.01;
  // Cuota acumulada esperada en cada límite superior, sumada tramo a tramo con los tipos de la escala.
  let lower = 0;
  let cumulative = 0;
  const limits = scale.flatMap((bracket, i) => {
    if (bracket.upTo === null) return [];
    cumulative += ((bracket.upTo - lower) * bracket.rate) / 100;
    lower = bracket.upTo;
    return [{ upTo: bracket.upTo, rate: bracket.rate, nextRate: itemAt(scale, i + 1).rate, tax: cumulative }];
  });

  it("la escala termina en un tramo abierto y sus límites son crecientes", () => {
    expect(scale.at(-1)?.upTo).toBeNull();
    limits.forEach((l, i) => i > 0 && expect(l.upTo).toBeGreaterThan(itemAt(limits, i - 1).upTo));
  });

  it.each(limits)("en $upTo la cuota es la acumulada del tramo y el límite pertenece al tramo inferior", (l) => {
    expect(applyProgressiveBrackets(l.upTo, scale)).toBeCloseTo(l.tax, 6);
    expect(marginalRate(l.upTo, scale)).toBe(l.rate);
  });

  it.each(limits)("es continua en $upTo: ±0,01 € mueve la cuota solo 0,01 × tipo del tramo", (l) => {
    const below = applyProgressiveBrackets(l.upTo - CENT, scale);
    const above = applyProgressiveBrackets(l.upTo + CENT, scale);
    expect(l.tax - below).toBeCloseTo((CENT * l.rate) / 100, 6);
    expect(above - l.tax).toBeCloseTo((CENT * l.nextRate) / 100, 6);
    expect(marginalRate(l.upTo + CENT, scale)).toBe(l.nextRate);
  });

  it("la cuota es monótona creciente cruzando todos los límites", () => {
    const bases = limits.flatMap((l) => [l.upTo - CENT, l.upTo, l.upTo + CENT]);
    const taxes = bases.map((b) => applyProgressiveBrackets(b, scale));
    taxes.forEach((t, i) => i > 0 && expect(t).toBeGreaterThanOrEqual(itemAt(taxes, i - 1)));
  });
});

describe("recordatorio de revisión fiscal", () => {
  it("las cifras de FISCAL_YEAR siguen vigentes (si falla, toca revisar escalas, mínimos y retenciones)", () => {
    expect(
      todayUtc() < FISCAL_REVIEW_BY,
      `Desde ${FISCAL_REVIEW_BY} hay que revisar las cifras de ${FISCAL_YEAR}: ver FISCAL_REVIEW_BY en brackets.ts`,
    ).toBe(true);
  });
});
