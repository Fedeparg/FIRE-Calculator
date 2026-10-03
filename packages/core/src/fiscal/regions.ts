// Regional IRPF scales (escalas autonómicas) and regional personal and family minimums of the 15
// common-regime regions (comunidades de régimen común). Pure core module.
// Scope and assumptions: see ./README.md. Indicative figures, without regional deductions.

import {
  IRPF_DEFAULT_REGIONAL_SCALE,
  ASCENDANT_MINIMUM,
  DESCENDANT_MINIMUMS,
  DESCENDANT_UNDER_3_MINIMUM,
  DISABILITY_MINIMUM_33,
  DISABILITY_MINIMUM_65,
  PERSONAL_MINIMUM,
  PERSONAL_MINIMUM_65,
  PERSONAL_MINIMUM_75,
  type Bracket,
} from "./brackets.js";

// ---------------------------------------------------------------------------
// Regional scales (tax years 2025 and 2026)
// ---------------------------------------------------------------------------

/** Andalucía — art. 23 Ley 5/2021, de 20 de octubre, de Tributos Cedidos. */
const IRPF_REGIONAL_SCALE_ANDALUCIA: readonly Bracket[] = [
  { upTo: 13000, rate: 9.5 },
  { upTo: 21100, rate: 12 },
  { upTo: 35200, rate: 15 },
  { upTo: 60000, rate: 18.5 },
  { upTo: null, rate: 22.5 },
];

/** Aragón — art. 110-1 TR tributos cedidos (Decreto Legislativo 1/2005, de 26 de septiembre). */
const IRPF_REGIONAL_SCALE_ARAGON: readonly Bracket[] = [
  { upTo: 13072.5, rate: 9.5 },
  { upTo: 21210, rate: 12 },
  { upTo: 36960, rate: 15 },
  { upTo: 52500, rate: 18.5 },
  { upTo: 60000, rate: 20.5 },
  { upTo: 80000, rate: 23 },
  { upTo: 90000, rate: 24 },
  { upTo: 130000, rate: 25 },
  { upTo: null, rate: 25.5 },
];

/**
 * Principado de Asturias — art. 2 TR Decreto Legislativo 2/2014, de 22 de octubre,
 * as worded by art. Único.Uno of Ley 3/2025, de 19 de noviembre (BOPA 2-12-2025),
 * which changed the scale with effect from 2025 itself.
 */
const IRPF_REGIONAL_SCALE_ASTURIAS: readonly Bracket[] = [
  { upTo: 12450, rate: 9 },
  { upTo: 17707.2, rate: 12 },
  { upTo: 33007.2, rate: 14 },
  { upTo: 53407.2, rate: 19.2 },
  { upTo: 70000, rate: 21.5 },
  { upTo: 90000, rate: 22.5 },
  { upTo: 175000, rate: 25 },
  { upTo: null, rate: 26 },
];

/** Illes Balears — art. 1 TR Decreto Legislativo 1/2014, de 6 de junio. */
const IRPF_REGIONAL_SCALE_BALEARES: readonly Bracket[] = [
  { upTo: 10000, rate: 9 },
  { upTo: 18000, rate: 11.25 },
  { upTo: 30000, rate: 14.25 },
  { upTo: 48000, rate: 17.5 },
  { upTo: 70000, rate: 19 },
  { upTo: 90000, rate: 21.75 },
  { upTo: 120000, rate: 22.75 },
  { upTo: 175000, rate: 23.75 },
  { upTo: null, rate: 24.75 },
];

/**
 * Canarias — art. 18 bis TR Decreto Legislativo 1/2009, de 21 de abril, after the 2.1%
 * deflation of DF 11ª of Ley 9/2025 (BOC 29-12-2025), effective from 1-1-2025. The last
 * bracket is €123,745, not the €121,200 in Hacienda's Annex I (text that predates the
 * deflation; see README).
 */
const IRPF_REGIONAL_SCALE_CANARIAS: readonly Bracket[] = [
  { upTo: 13748, rate: 9 },
  { upTo: 19422, rate: 11.5 },
  { upTo: 35924, rate: 14 },
  { upTo: 57566, rate: 18.5 },
  { upTo: 93268, rate: 23.5 },
  { upTo: 123745, rate: 25 },
  { upTo: null, rate: 26 },
];

/** Cantabria — art. 1 TR Decreto Legislativo 62/2008, de 19 de junio. */
const IRPF_REGIONAL_SCALE_CANTABRIA: readonly Bracket[] = [
  { upTo: 13000, rate: 8.5 },
  { upTo: 21000, rate: 11 },
  { upTo: 35200, rate: 14.5 },
  { upTo: 60000, rate: 18 },
  { upTo: 90000, rate: 22.5 },
  { upTo: null, rate: 24.5 },
];

/**
 * Castilla-La Mancha — art. 13 bis Ley 8/2013, de 21 de noviembre. The only scale identical
 * to the default regional scale of art. 65 LIRPF (sums to 19 / 24 / 30 / 37 / 45 / 47): it is
 * referenced instead of copied. If the region changes it, its own table goes here.
 */
const IRPF_REGIONAL_SCALE_CASTILLA_LA_MANCHA: readonly Bracket[] = IRPF_DEFAULT_REGIONAL_SCALE;

/** Castilla y León — art. 1 TR Decreto Legislativo 1/2013, de 12 de septiembre. */
const IRPF_REGIONAL_SCALE_CASTILLA_Y_LEON: readonly Bracket[] = [
  { upTo: 12450, rate: 9 },
  { upTo: 20200, rate: 12 },
  { upTo: 35200, rate: 14 },
  { upTo: 53407.2, rate: 18.5 },
  { upTo: null, rate: 21.5 },
];

/**
 * Cataluña — art. 611-1 Decreto Legislativo 1/2024, de 12 de marzo (book six of the
 * Catalan tax code, código tributario de Catalunya).
 */
const IRPF_REGIONAL_SCALE_CATALUNA: readonly Bracket[] = [
  { upTo: 12500, rate: 9.5 },
  { upTo: 22000, rate: 12.5 },
  { upTo: 33000, rate: 16 },
  { upTo: 53000, rate: 19 },
  { upTo: 90000, rate: 21.5 },
  { upTo: 120000, rate: 23.5 },
  { upTo: 175000, rate: 24.5 },
  { upTo: null, rate: 25.5 },
];

/** Extremadura — art. 1 TR Decreto Legislativo 1/2018, de 10 de abril. */
const IRPF_REGIONAL_SCALE_EXTREMADURA: readonly Bracket[] = [
  { upTo: 12450, rate: 8 },
  { upTo: 20200, rate: 10 },
  { upTo: 24200, rate: 16 },
  { upTo: 35200, rate: 17.5 },
  { upTo: 60000, rate: 21 },
  { upTo: 80200, rate: 23.5 },
  { upTo: 99200, rate: 24 },
  { upTo: 120200, rate: 24.5 },
  { upTo: null, rate: 25 },
];

/** Galicia — art. 4 TR Decreto Legislativo 1/2011, de 28 de julio. */
const IRPF_REGIONAL_SCALE_GALICIA: readonly Bracket[] = [
  { upTo: 12985.35, rate: 9 },
  { upTo: 21068.6, rate: 11.65 },
  { upTo: 35200, rate: 14.9 },
  { upTo: 60000, rate: 18.4 },
  { upTo: null, rate: 22.5 },
];

/** Comunidad de Madrid — art. 1 TR Decreto Legislativo 1/2010, de 21 de octubre. */
const IRPF_REGIONAL_SCALE_MADRID: readonly Bracket[] = [
  { upTo: 13362.22, rate: 8.5 },
  { upTo: 19004.63, rate: 10.7 },
  { upTo: 35425.68, rate: 12.8 },
  { upTo: 57320.4, rate: 17.4 },
  { upTo: null, rate: 20.5 },
];

/** Región de Murcia — art. 2 TR Decreto Legislativo 1/2010, de 5 de noviembre. */
const IRPF_REGIONAL_SCALE_MURCIA: readonly Bracket[] = [
  { upTo: 12450, rate: 9.5 },
  { upTo: 20200, rate: 11.2 },
  { upTo: 34000, rate: 13.3 },
  { upTo: 60000, rate: 17.9 },
  { upTo: null, rate: 22.5 },
];

/** La Rioja — art. 31 Ley 10/2017, de 27 de octubre. */
const IRPF_REGIONAL_SCALE_LA_RIOJA: readonly Bracket[] = [
  { upTo: 12450, rate: 8 },
  { upTo: 20200, rate: 10.6 },
  { upTo: 35200, rate: 13.6 },
  { upTo: 40000, rate: 17.8 },
  { upTo: 50000, rate: 18.3 },
  { upTo: 60000, rate: 19 },
  { upTo: 120000, rate: 24.5 },
  { upTo: null, rate: 27 },
];

/** Comunitat Valenciana — art. 2 Ley 13/1997, de 23 de diciembre. */
const IRPF_REGIONAL_SCALE_VALENCIANA: readonly Bracket[] = [
  { upTo: 12000, rate: 9 },
  { upTo: 22000, rate: 12 },
  { upTo: 32000, rate: 15 },
  { upTo: 42000, rate: 17.5 },
  { upTo: 52000, rate: 20 },
  { upTo: 62000, rate: 22.5 },
  { upTo: 72000, rate: 25 },
  { upTo: 100000, rate: 26.5 },
  { upTo: 150000, rate: 27.5 },
  { upTo: 200000, rate: 28.5 },
  { upTo: null, rate: 29.5 },
];

// ---------------------------------------------------------------------------
// Regional personal and family minimum
// ---------------------------------------------------------------------------

/**
 * Personal and family minimum (mínimo personal y familiar) amounts the engine models
 * (arts. 57-60 LIRPF). The amounts per age bracket are cumulative totals, not increments.
 */
export interface PersonalMinimumSchedule {
  /** Minimum for a taxpayer under 65. */
  readonly taxpayer: number;
  /** Minimum for a taxpayer aged 65 to 74 (total). */
  readonly taxpayer65: number;
  /** Minimum for a taxpayer aged 75 or over (total). */
  readonly taxpayer75: number;
  /** Minimum for the 1st, 2nd, 3rd and 4th and subsequent descendants. */
  readonly descendants: readonly [number, number, number, number];
  /** Increase for each descendant under 3. */
  readonly descendantUnder3: number;
  /** Minimum for each dependent ascendant over 65. */
  readonly ascendant65: number;
  /** Increase for a taxpayer disability of grade 33-65%. */
  readonly disability33: number;
  /** Increase for a taxpayer disability of grade ≥ 65%. */
  readonly disability65: number;
}

/**
 * State minimum (arts. 57-60 LIRPF). It always feeds the state tax; the regional one only
 * feeds the regional tax (art. 46.1.a Ley 22/2009).
 */
export const STATE_PERSONAL_MINIMUM: PersonalMinimumSchedule = {
  taxpayer: PERSONAL_MINIMUM,
  taxpayer65: PERSONAL_MINIMUM_65,
  taxpayer75: PERSONAL_MINIMUM_75,
  descendants: DESCENDANT_MINIMUMS,
  descendantUnder3: DESCENDANT_UNDER_3_MINIMUM,
  ascendant65: ASCENDANT_MINIMUM,
  disability33: DISABILITY_MINIMUM_33,
  disability65: DISABILITY_MINIMUM_65,
};

// Tax year 2025 amounts (AEAT, Manual de Renta 2025, comparative table of minimums). The
// 2026 ones are not published yet: continuity unverified.

/** Andalucía — own minimums. */
const MINIMUM_ANDALUCIA: PersonalMinimumSchedule = {
  taxpayer: 5790,
  taxpayer65: 6990,
  taxpayer75: 8450,
  descendants: [2510, 2820, 4170, 4700],
  descendantUnder3: 2920,
  ascendant65: 1200,
  disability33: 3130,
  disability65: 9390,
};

/** Principado de Asturias — own minimums. */
const MINIMUM_ASTURIAS: PersonalMinimumSchedule = {
  taxpayer: 6105,
  taxpayer65: 7370,
  taxpayer75: 8910,
  descendants: [2640, 2970, 4400, 4950],
  descendantUnder3: 3080,
  ascendant65: 1265,
  disability33: 3300,
  disability65: 9900,
};

/** Canarias — own minimums. */
const MINIMUM_CANARIAS: PersonalMinimumSchedule = {
  taxpayer: 5606,
  taxpayer65: 6768,
  taxpayer75: 8182,
  descendants: [2424, 2727, 4040, 4545],
  descendantUnder3: 2828,
  ascendant65: 1162,
  disability33: 3030,
  disability65: 9090,
};

/** Galicia — own minimums. */
const MINIMUM_GALICIA: PersonalMinimumSchedule = {
  taxpayer: 5789,
  taxpayer65: 6988,
  taxpayer75: 8448,
  descendants: [2503, 2816, 4172, 4694],
  descendantUnder3: 2920,
  ascendant65: 1199,
  disability33: 3129,
  disability65: 9387,
};

/** Comunidad de Madrid — own minimums. */
const MINIMUM_MADRID: PersonalMinimumSchedule = {
  taxpayer: 5956.65,
  taxpayer65: 7190.91,
  taxpayer75: 8693.49,
  descendants: [2575.85, 2897.83, 4400, 4950],
  descendantUnder3: 3005.16,
  ascendant65: 1234.26,
  disability33: 3219.81,
  disability65: 9659.44,
};

/** Comunitat Valenciana — own minimums (they match Asturias's, but they are different laws: not shared). */
const MINIMUM_VALENCIANA: PersonalMinimumSchedule = {
  taxpayer: 6105,
  taxpayer65: 7370,
  taxpayer75: 8910,
  descendants: [2640, 2970, 4400, 4950],
  descendantUnder3: 3080,
  ascendant65: 1265,
  disability33: 3300,
  disability65: 9900,
};

// ---------------------------------------------------------------------------
// Region catalogue
// ---------------------------------------------------------------------------

/** Common-regime regions (comunidades autónomas) with their own IRPF scale. */
export type RegionCode = (typeof REGION_CODES)[number];

/** Tax definition of a common-regime region. */
export interface RegionDefinition {
  /** Regional scale for the general taxable base (base liquidable general). */
  readonly scale: readonly Bracket[];
  /**
   * Regional personal and family minimum, only if the region changes it in any of the
   * items this engine models. If missing, the regional tax uses the state minimum.
   */
  readonly minimum?: PersonalMinimumSchedule;
}

export const REGIONS: Record<RegionCode, RegionDefinition> = {
  andalucia: { scale: IRPF_REGIONAL_SCALE_ANDALUCIA, minimum: MINIMUM_ANDALUCIA },
  aragon: { scale: IRPF_REGIONAL_SCALE_ARAGON },
  asturias: { scale: IRPF_REGIONAL_SCALE_ASTURIAS, minimum: MINIMUM_ASTURIAS },
  // Baleares has no own minimum on purpose: the AEAT table is ambiguous (see README).
  baleares: { scale: IRPF_REGIONAL_SCALE_BALEARES },
  canarias: { scale: IRPF_REGIONAL_SCALE_CANARIAS, minimum: MINIMUM_CANARIAS },
  cantabria: { scale: IRPF_REGIONAL_SCALE_CANTABRIA },
  "castilla-la-mancha": { scale: IRPF_REGIONAL_SCALE_CASTILLA_LA_MANCHA },
  "castilla-y-leon": { scale: IRPF_REGIONAL_SCALE_CASTILLA_Y_LEON },
  cataluna: { scale: IRPF_REGIONAL_SCALE_CATALUNA },
  extremadura: { scale: IRPF_REGIONAL_SCALE_EXTREMADURA },
  galicia: { scale: IRPF_REGIONAL_SCALE_GALICIA, minimum: MINIMUM_GALICIA },
  madrid: { scale: IRPF_REGIONAL_SCALE_MADRID, minimum: MINIMUM_MADRID },
  murcia: { scale: IRPF_REGIONAL_SCALE_MURCIA },
  // La Rioja only differs in the disability of descendants, which is not modelled.
  "la-rioja": { scale: IRPF_REGIONAL_SCALE_LA_RIOJA },
  valencia: { scale: IRPF_REGIONAL_SCALE_VALENCIANA, minimum: MINIMUM_VALENCIANA },
};

/** Supported regions, in the order the selector shows them. */
export const REGION_CODES = [
  "andalucia",
  "aragon",
  "asturias",
  "baleares",
  "canarias",
  "cantabria",
  "castilla-la-mancha",
  "castilla-y-leon",
  "cataluna",
  "extremadura",
  "galicia",
  "madrid",
  "murcia",
  "la-rioja",
  "valencia",
] as const;

/** Territories that appear in the selector but cannot be calculated. */
export type UnsupportedRegionCode = "alava" | "bizkaia" | "gipuzkoa" | "navarra" | "ceuta-melilla";

/** Why a territory is not supported (feeds the selector). */
export type UnsupportedRegionReason = "foral" | "ceutaMelilla";

export interface UnsupportedRegion {
  readonly code: UnsupportedRegionCode;
  readonly reason: UnsupportedRegionReason;
}

/**
 * Territories shown disabled in the selector, with the reason: omitting them would suggest
 * the generic result applies to them (foral regime and Ceuta/Melilla: see README).
 */
export const UNSUPPORTED_REGIONS: readonly UnsupportedRegion[] = [
  { code: "alava", reason: "foral" },
  { code: "bizkaia", reason: "foral" },
  { code: "gipuzkoa", reason: "foral" },
  { code: "navarra", reason: "foral" },
  { code: "ceuta-melilla", reason: "ceutaMelilla" },
];

/**
 * Value of the region selector: a supported region, an unsupported territory (disabled
 * option) or "" = unspecified.
 */
export type RegionSelection = RegionCode | UnsupportedRegionCode | "";

/**
 * Selections that can actually be chosen: no region ("") and the supported ones. This way a
 * URL with a disabled territory falls back to "" instead of leaving a state unreachable from
 * the UI.
 */
export const SELECTABLE_REGIONS: readonly RegionSelection[] = ["", ...REGION_CODES];

/** Engine code for a selection, or `undefined` if there is no region or it is not supported. */
export function toSupportedRegion(selection: RegionSelection): RegionCode | undefined {
  return REGION_CODES.find((code) => code === selection);
}

/** Regional scale of a common-regime region. */
export function regionalScale(region: RegionCode): readonly Bracket[] {
  return REGIONS[region].scale;
}

/** Minimum that applies to the regional tax: the region's own or, failing that, the state one. */
export function regionalMinimumSchedule(region: RegionCode): PersonalMinimumSchedule {
  return REGIONS[region].minimum ?? STATE_PERSONAL_MINIMUM;
}
