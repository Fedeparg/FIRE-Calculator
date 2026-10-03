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
  it("base 0 → tax 0", () => {
    expect(applyProgressiveBrackets(0, SIMPLE)).toBe(0);
  });

  it("taxes only the first bracket", () => {
    expect(applyProgressiveBrackets(100, SIMPLE)).toBeCloseTo(10, 6);
  });

  it("splits the base across brackets (not all at the top rate)", () => {
    // 100×10% + 100×20% + 50×30% = 10 + 20 + 15 = 45
    expect(applyProgressiveBrackets(250, SIMPLE)).toBeCloseTo(45, 6);
  });

  it("treats negative input as 0", () => {
    expect(applyProgressiveBrackets(-50, SIMPLE)).toBe(0);
  });

  it("savings scale: €10,000 → 19%×6000 + 21%×4000", () => {
    expect(applyProgressiveBrackets(10000, IRPF_SAVINGS_SCALE)).toBeCloseTo(1140 + 840, 6);
  });
});

describe("marginalRate", () => {
  it("returns the rate of the bracket the base falls in", () => {
    expect(marginalRate(150, SIMPLE)).toBe(20);
    expect(marginalRate(5000, IRPF_GENERAL_SCALE)).toBe(19);
    expect(marginalRate(40000, IRPF_GENERAL_SCALE)).toBe(37);
  });
});

describe("effectiveRate", () => {
  it("base 0 → 0", () => {
    expect(effectiveRate(0, SIMPLE)).toBe(0);
  });

  it("is always less than or equal to the marginal rate", () => {
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
] as const)("bracket boundaries of %s", (_name, scale) => {
  const CENT = 0.01;
  // Expected cumulative tax at each upper boundary, summed bracket by bracket with the scale's rates.
  let lower = 0;
  let cumulative = 0;
  const limits = scale.flatMap((bracket, i) => {
    if (bracket.upTo === null) return [];
    cumulative += ((bracket.upTo - lower) * bracket.rate) / 100;
    lower = bracket.upTo;
    return [{ upTo: bracket.upTo, rate: bracket.rate, nextRate: itemAt(scale, i + 1).rate, tax: cumulative }];
  });

  it("the scale ends in an open-ended bracket and its boundaries are increasing", () => {
    expect(scale.at(-1)?.upTo).toBeNull();
    limits.forEach((l, i) => i > 0 && expect(l.upTo).toBeGreaterThan(itemAt(limits, i - 1).upTo));
  });

  it.each(limits)(
    "at $upTo the tax is the bracket's cumulative one and the boundary belongs to the lower bracket",
    (l) => {
      expect(applyProgressiveBrackets(l.upTo, scale)).toBeCloseTo(l.tax, 6);
      expect(marginalRate(l.upTo, scale)).toBe(l.rate);
    },
  );

  it.each(limits)("is continuous at $upTo: ±€0.01 moves the tax by only 0.01 × the bracket rate", (l) => {
    const below = applyProgressiveBrackets(l.upTo - CENT, scale);
    const above = applyProgressiveBrackets(l.upTo + CENT, scale);
    expect(l.tax - below).toBeCloseTo((CENT * l.rate) / 100, 6);
    expect(above - l.tax).toBeCloseTo((CENT * l.nextRate) / 100, 6);
    expect(marginalRate(l.upTo + CENT, scale)).toBe(l.nextRate);
  });

  it("the tax is monotonically increasing across every boundary", () => {
    const bases = limits.flatMap((l) => [l.upTo - CENT, l.upTo, l.upTo + CENT]);
    const taxes = bases.map((b) => applyProgressiveBrackets(b, scale));
    taxes.forEach((t, i) => i > 0 && expect(t).toBeGreaterThanOrEqual(itemAt(taxes, i - 1)));
  });
});

describe("tax review reminder", () => {
  it("the FISCAL_YEAR figures are still current (if this fails, review scales, allowances and withholdings)", () => {
    expect(
      todayUtc() < FISCAL_REVIEW_BY,
      `Since ${FISCAL_REVIEW_BY} the ${FISCAL_YEAR} figures must be reviewed: see FISCAL_REVIEW_BY in brackets.ts`,
    ).toBe(true);
  });
});
