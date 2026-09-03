import { describe, expect, it } from "vitest";
import {
  IRPF_AUTONOMICA_SUPLETORIA,
  IRPF_ESTATAL_GENERAL,
  IRPF_GENERAL,
  applyProgressiveBrackets,
  marginalRate,
} from "./brackets";
import {
  REGIONS,
  REGION_CODES,
  STATE_PERSONAL_MINIMUM,
  UNSUPPORTED_REGIONS,
  regionalMinimumSchedule,
  regionalScale,
  toSupportedRegion,
  type RegionCode,
} from "./regions";

/** Bases de prueba: cero, tramos bajos, cada frontera relevante y rentas altas. */
const SAMPLE_BASES = [
  0, 1, 5550, 12450, 12450.01, 20200, 35200, 57320.4, 60000, 100000, 123745, 175000, 300000,
  400000, 1000000,
];

describe("escala estatal (art. 63.1.1º LIRPF)", () => {
  // Columna oficial de "cuota íntegra" acumulada del manual de Renta de la AEAT:
  // es la comprobación externa de que la transcripción de límites y tipos es
  // correcta (un error en cualquiera de los dos rompería la cadena).
  it.each([
    [12450, 1182.75],
    [20200, 2112.75],
    [35200, 4362.75],
    [60000, 8950.75],
    [300000, 62950.75],
  ])("cuota íntegra acumulada en %d € = %d €", (base, expected) => {
    expect(applyProgressiveBrackets(base, IRPF_ESTATAL_GENERAL)).toBeCloseTo(expected, 6);
  });

  it("se aplica verbatim: NO lleva factor 0,5", () => {
    // 12.450 € al 9,50 %. Con un 0,5 espurio saldría la mitad.
    expect(applyProgressiveBrackets(12450, IRPF_ESTATAL_GENERAL)).toBeCloseTo(1182.75, 6);
  });
});

describe("escala autonómica supletoria (art. 65 LIRPF)", () => {
  it("estatal + supletoria reproduce la escala conjunta 19/24/30/37/45/47", () => {
    for (const base of SAMPLE_BASES) {
      const split =
        applyProgressiveBrackets(base, IRPF_ESTATAL_GENERAL) +
        applyProgressiveBrackets(base, IRPF_AUTONOMICA_SUPLETORIA);
      expect(split).toBeCloseTo(applyProgressiveBrackets(base, IRPF_GENERAL), 6);
    }
  });

  it("su último tramo es 22,50 % plano, no 24,50 % como el estatal", () => {
    // Por encima de 300.000 € el marginal conjunto es 47 % (24,5 + 22,5), no 49 %.
    expect(marginalRate(400000, IRPF_AUTONOMICA_SUPLETORIA)).toBe(22.5);
    expect(marginalRate(400000, IRPF_ESTATAL_GENERAL)).toBe(24.5);
    expect(marginalRate(400000, IRPF_GENERAL)).toBe(47);
  });
});

describe("catálogo de comunidades", () => {
  it("REGION_CODES y REGIONS contienen exactamente las mismas 15 comunidades", () => {
    expect([...REGION_CODES].sort()).toEqual(Object.keys(REGIONS).sort());
    expect(REGION_CODES).toHaveLength(15);
    expect(new Set(REGION_CODES).size).toBe(15);
  });

  it("los territorios no soportados no se solapan con los soportados", () => {
    const supported = new Set<string>(REGION_CODES);
    for (const { code } of UNSUPPORTED_REGIONS) expect(supported.has(code)).toBe(false);
  });

  it("no hay ni una cifra foral: País Vasco y Navarra solo existen como opción deshabilitada", () => {
    const foral = UNSUPPORTED_REGIONS.filter((r) => r.reason === "foral").map((r) => r.code);
    expect(foral).toEqual(["alava", "bizkaia", "gipuzkoa", "navarra"]);
  });

  it("toSupportedRegion filtra el vacío y los territorios no soportados", () => {
    expect(toSupportedRegion("")).toBeUndefined();
    expect(toSupportedRegion("navarra")).toBeUndefined();
    expect(toSupportedRegion("ceuta-melilla")).toBeUndefined();
    expect(toSupportedRegion("madrid")).toBe("madrid");
  });
});

describe("forma de las escalas autonómicas", () => {
  it.each(REGION_CODES)("%s: tramos crecientes, último abierto y tipos razonables", (region) => {
    const scale = regionalScale(region);
    expect(scale.length).toBeGreaterThan(0);
    expect(scale[scale.length - 1].upTo).toBeNull();

    let previousLimit = 0;
    let previousRate = 0;
    scale.forEach((bracket, index) => {
      // Solo el último tramo puede ser abierto.
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

describe("contraste con el segundo organismo (Hacienda, Medidas 2026)", () => {
  // Número de tramos, marginal mínimo y máximo y umbral del último tramo que
  // publica el Ministerio de Hacienda, independientes del manual de la AEAT del
  // que se transcribieron las escalas. Canarias va con 123.745 € y no con los
  // 121.200 € del Anexo I: ese texto es boilerplate anterior a la deflactación
  // del 2,1 % de 2025 (121.200 × 1,021 = 123.745,2).
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
    "%s: %d tramos, del %d %% al %d %% desde %d €",
    (region, brackets, minRate, maxRate, lastThreshold) => {
      const scale = regionalScale(region);
      expect(scale).toHaveLength(brackets);
      expect(scale[0].rate).toBe(minRate);
      expect(scale[scale.length - 1].rate).toBe(maxRate);
      expect(scale[scale.length - 2].upTo).toBe(lastThreshold);
    },
  );

  it("las 15 comunidades están contrastadas", () => {
    expect(CROSS_CHECK.map(([region]) => region).sort()).toEqual([...REGION_CODES].sort());
  });
});

describe("Castilla-La Mancha", () => {
  it("su escala es idéntica a la supletoria, así que reproduce la conjunta 19/24/30/37/45/47", () => {
    for (const base of SAMPLE_BASES) {
      const combined =
        applyProgressiveBrackets(base, IRPF_ESTATAL_GENERAL) +
        applyProgressiveBrackets(base, regionalScale("castilla-la-mancha"));
      expect(combined).toBeCloseTo(applyProgressiveBrackets(base, IRPF_GENERAL), 6);
    }
  });
});

describe("mínimo personal y familiar autonómico", () => {
  it("las comunidades sin importes propios caen al mínimo estatal", () => {
    for (const region of REGION_CODES) {
      if (REGIONS[region].minimum === undefined) {
        expect(regionalMinimumSchedule(region)).toBe(STATE_PERSONAL_MINIMUM);
      }
    }
  });

  it("Illes Balears y La Rioja usan el mínimo estatal a propósito (huecos declarados)", () => {
    expect(REGIONS.baleares.minimum).toBeUndefined();
    expect(REGIONS["la-rioja"].minimum).toBeUndefined();
  });

  it("las 6 comunidades con mínimo propio lo suben respecto del estatal", () => {
    const withOwnMinimum = REGION_CODES.filter((r) => REGIONS[r].minimum !== undefined);
    expect(withOwnMinimum).toEqual([
      "andalucia",
      "asturias",
      "canarias",
      "galicia",
      "madrid",
      "valencia",
    ]);

    for (const region of withOwnMinimum) {
      const schedule = regionalMinimumSchedule(region);
      expect(schedule.taxpayer).toBeGreaterThan(STATE_PERSONAL_MINIMUM.taxpayer);
      expect(schedule.taxpayer65).toBeGreaterThan(schedule.taxpayer);
      expect(schedule.taxpayer75).toBeGreaterThan(schedule.taxpayer65);
      // Los descendientes se acumulan en orden creciente.
      const [first, second, third, fourth] = schedule.descendants;
      expect(second).toBeGreaterThan(first);
      expect(third).toBeGreaterThan(second);
      expect(fourth).toBeGreaterThan(third);
      expect(schedule.disability65).toBeGreaterThan(schedule.disability33);
    }
  });
});
