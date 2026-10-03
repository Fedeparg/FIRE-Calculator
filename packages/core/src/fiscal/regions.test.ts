import { describe, expect, it } from "vitest";
import {
  IRPF_DEFAULT_REGIONAL_SCALE,
  IRPF_STATE_SCALE,
  IRPF_GENERAL_SCALE,
  applyProgressiveBrackets,
  marginalRate,
} from "./brackets.js";
import {
  REGIONS,
  REGION_CODES,
  STATE_PERSONAL_MINIMUM,
  UNSUPPORTED_REGIONS,
  regionalMinimumSchedule,
  regionalScale,
  toSupportedRegion,
  type RegionCode,
} from "./regions.js";
import { itemAt } from "../arrays.js";

/** Test bases: zero, low brackets, every relevant boundary and high incomes. */
const SAMPLE_BASES = [
  0, 1, 5550, 12450, 12450.01, 20200, 35200, 57320.4, 60000, 100000, 123745, 175000, 300000, 400000, 1000000,
];

describe("state scale (art. 63.1.1º LIRPF)", () => {
  // Official cumulative "cuota íntegra" (gross tax liability) column of the AEAT's Renta manual:
  // it is the external check that the transcription of thresholds and rates is
  // correct (an error in either would break the chain).
  it.each([
    [12450, 1182.75],
    [20200, 2112.75],
    [35200, 4362.75],
    [60000, 8950.75],
    [300000, 62950.75],
  ])("cumulative gross tax liability at €%d = €%d", (base, expected) => {
    expect(applyProgressiveBrackets(base, IRPF_STATE_SCALE)).toBeCloseTo(expected, 6);
  });

  it("is applied verbatim: NO 0.5 factor", () => {
    // €12,450 at 9.50%. A spurious 0.5 would halve it.
    expect(applyProgressiveBrackets(12450, IRPF_STATE_SCALE)).toBeCloseTo(1182.75, 6);
  });
});

describe("fallback regional scale (escala autonómica supletoria, art. 65 LIRPF)", () => {
  it("state + fallback reproduces the combined 19/24/30/37/45/47 scale", () => {
    for (const base of SAMPLE_BASES) {
      const split =
        applyProgressiveBrackets(base, IRPF_STATE_SCALE) + applyProgressiveBrackets(base, IRPF_DEFAULT_REGIONAL_SCALE);
      expect(split).toBeCloseTo(applyProgressiveBrackets(base, IRPF_GENERAL_SCALE), 6);
    }
  });

  it("its top bracket is a flat 22.50%, not 24.50% like the state one", () => {
    // Above €300,000 the combined marginal rate is 47% (24.5 + 22.5), not 49%.
    expect(marginalRate(400000, IRPF_DEFAULT_REGIONAL_SCALE)).toBe(22.5);
    expect(marginalRate(400000, IRPF_STATE_SCALE)).toBe(24.5);
    expect(marginalRate(400000, IRPF_GENERAL_SCALE)).toBe(47);
  });
});

describe("region catalogue", () => {
  it("REGION_CODES and REGIONS contain exactly the same 15 regions", () => {
    expect([...REGION_CODES].sort()).toEqual(Object.keys(REGIONS).sort());
    expect(REGION_CODES).toHaveLength(15);
    expect(new Set(REGION_CODES).size).toBe(15);
  });

  it("unsupported territories do not overlap the supported ones", () => {
    const supported = new Set<string>(REGION_CODES);
    for (const { code } of UNSUPPORTED_REGIONS) expect(supported.has(code)).toBe(false);
  });

  it("there is not a single foral figure: the Basque Country and Navarra only exist as disabled options", () => {
    const foralCodes = UNSUPPORTED_REGIONS.filter((r) => r.reason === "foral").map((r) => r.code);
    expect(foralCodes).toEqual(["alava", "bizkaia", "gipuzkoa", "navarra"]);
  });

  it("toSupportedRegion filters out the empty value and unsupported territories", () => {
    expect(toSupportedRegion("")).toBeUndefined();
    expect(toSupportedRegion("navarra")).toBeUndefined();
    expect(toSupportedRegion("ceuta-melilla")).toBeUndefined();
    expect(toSupportedRegion("madrid")).toBe("madrid");
  });
});

describe("shape of the regional scales", () => {
  it.each(REGION_CODES)("%s: increasing brackets, open-ended last one and reasonable rates", (region) => {
    const scale = regionalScale(region);
    expect(scale.length).toBeGreaterThan(0);
    expect(itemAt(scale, scale.length - 1).upTo).toBeNull();

    let previousLimit = 0;
    let previousRate = 0;
    scale.forEach((bracket, index) => {
      // Only the last bracket may be open-ended.
      const limit = bracket.upTo;
      if (index < scale.length - 1) {
        expect(limit).not.toBeNull();
        expect(limit ?? 0).toBeGreaterThan(previousLimit);
        previousLimit = limit ?? 0;
      }
      expect(bracket.rate).toBeGreaterThan(0);
      expect(bracket.rate).toBeLessThanOrEqual(30);
      expect(bracket.rate).toBeGreaterThanOrEqual(previousRate);
      previousRate = bracket.rate;
    });
  });
});

describe("cross-check against the second body (Hacienda, Medidas 2026)", () => {
  // Number of brackets, lowest and highest marginal rate and top-bracket threshold as
  // published by the Ministerio de Hacienda, independent of the AEAT manual the
  // scales were transcribed from. Canarias uses €123,745 rather than the
  // €121,200 in Anexo I: that text is boilerplate predating the 2.1% inflation
  // adjustment of 2025 (121,200 × 1.021 = 123,745.2).
  const CROSS_CHECK: ReadonlyArray<readonly [RegionCode, number, number, number, number]> = [
    ["andalucia", 5, 9.5, 22.5, 60000],
    ["aragon", 9, 9.5, 25.5, 130000],
    ["asturias", 8, 9, 26, 175000],
    ["baleares", 9, 9, 24.75, 175000],
    ["canarias", 7, 9, 26, 123745],
    ["cantabria", 6, 8.5, 24.5, 90000],
    ["castilla-la-mancha", 5, 9.5, 22.5, 60000],
    ["castilla-y-leon", 5, 9, 21.5, 53407.2],
    ["cataluna", 8, 9.5, 25.5, 175000],
    ["extremadura", 9, 8, 25, 120200],
    ["galicia", 5, 9, 22.5, 60000],
    ["madrid", 5, 8.5, 20.5, 57320.4],
    ["murcia", 5, 9.5, 22.5, 60000],
    ["la-rioja", 8, 8, 27, 120000],
    ["valencia", 11, 9, 29.5, 200000],
  ];

  it.each(CROSS_CHECK)(
    "%s: %d brackets, from %d%% to %d%% above €%d",
    (region, brackets, minRate, maxRate, lastThreshold) => {
      const scale = regionalScale(region);
      expect(scale).toHaveLength(brackets);
      expect(itemAt(scale, 0).rate).toBe(minRate);
      expect(itemAt(scale, scale.length - 1).rate).toBe(maxRate);
      expect(itemAt(scale, scale.length - 2).upTo).toBe(lastThreshold);
    },
  );

  it("all 15 regions are cross-checked", () => {
    expect(CROSS_CHECK.map(([region]) => region).sort()).toEqual([...REGION_CODES].sort());
  });
});

describe("Castilla-La Mancha", () => {
  it("its scale is identical to the fallback one, so it reproduces the combined 19/24/30/37/45/47", () => {
    for (const base of SAMPLE_BASES) {
      const combined =
        applyProgressiveBrackets(base, IRPF_STATE_SCALE) +
        applyProgressiveBrackets(base, regionalScale("castilla-la-mancha"));
      expect(combined).toBeCloseTo(applyProgressiveBrackets(base, IRPF_GENERAL_SCALE), 6);
    }
  });
});

describe("regional personal and family allowance (mínimo personal y familiar)", () => {
  it("regions without their own amounts fall back to the state allowance", () => {
    for (const region of REGION_CODES) {
      if (REGIONS[region].minimum === undefined) {
        expect(regionalMinimumSchedule(region)).toBe(STATE_PERSONAL_MINIMUM);
      }
    }
  });

  it("Illes Balears and La Rioja use the state allowance on purpose (declared gaps)", () => {
    expect(REGIONS.baleares.minimum).toBeUndefined();
    expect(REGIONS["la-rioja"].minimum).toBeUndefined();
  });

  it("the 6 regions with their own allowance raise it above the state one", () => {
    const withOwnMinimum = REGION_CODES.filter((r) => REGIONS[r].minimum !== undefined);
    expect(withOwnMinimum).toEqual(["andalucia", "asturias", "canarias", "galicia", "madrid", "valencia"]);

    for (const region of withOwnMinimum) {
      const schedule = regionalMinimumSchedule(region);
      expect(schedule.taxpayer).toBeGreaterThan(STATE_PERSONAL_MINIMUM.taxpayer);
      expect(schedule.taxpayer65).toBeGreaterThan(schedule.taxpayer);
      expect(schedule.taxpayer75).toBeGreaterThan(schedule.taxpayer65);
      // Descendant amounts accumulate in increasing order.
      const [first, second, third, fourth] = schedule.descendants;
      expect(second).toBeGreaterThan(first);
      expect(third).toBeGreaterThan(second);
      expect(fourth).toBeGreaterThan(third);
      expect(schedule.disability65).toBeGreaterThan(schedule.disability33);
    }
  });
});
