// Escalas autonómicas del IRPF y mínimos personales y familiares autonómicos de las 15
// comunidades de régimen común. Core puro.
// Alcance y supuestos: ver ./README.md. Cifras orientativas, sin deducciones autonómicas.

import {
  MINIMO_ASCENDIENTES,
  MINIMO_DESCENDIENTES,
  MINIMO_DESCENDIENTE_MENOR_3,
  MINIMO_DISCAPACIDAD_33,
  MINIMO_DISCAPACIDAD_65,
  MINIMO_PERSONAL,
  MINIMO_PERSONAL_65,
  MINIMO_PERSONAL_75,
  type Bracket,
} from "./brackets.js";

// ---------------------------------------------------------------------------
// Escalas autonómicas (ejercicios 2025 y 2026)
// ---------------------------------------------------------------------------

/** Andalucía — art. 23 Ley 5/2021, de 20 de octubre, de Tributos Cedidos. */
const IRPF_AUT_ANDALUCIA: readonly Bracket[] = [
  { upTo: 13000, rate: 9.5 },
  { upTo: 21100, rate: 12 },
  { upTo: 35200, rate: 15 },
  { upTo: 60000, rate: 18.5 },
  { upTo: null, rate: 22.5 },
];

/** Aragón — art. 110-1 TR tributos cedidos (Decreto Legislativo 1/2005, de 26 de septiembre). */
const IRPF_AUT_ARAGON: readonly Bracket[] = [
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
 * en la redacción dada por el art. Único.Uno de la Ley 3/2025, de 19 de noviembre
 * (BOPA 2-12-2025), que modificó la escala con efectos en el propio 2025.
 */
const IRPF_AUT_ASTURIAS: readonly Bracket[] = [
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
const IRPF_AUT_BALEARES: readonly Bracket[] = [
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
 * Canarias — art. 18 bis TR Decreto Legislativo 1/2009, de 21 de abril, tras la
 * deflactación del 2,1 % de la DF 11ª de la Ley 9/2025 (BOC 29-12-2025), con
 * efectos desde el 1-1-2025. El último tramo es 123.745 €, no los 121.200 € del
 * Anexo I de Hacienda (texto anterior a la deflactación; ver README).
 */
const IRPF_AUT_CANARIAS: readonly Bracket[] = [
  { upTo: 13748, rate: 9 },
  { upTo: 19422, rate: 11.5 },
  { upTo: 35924, rate: 14 },
  { upTo: 57566, rate: 18.5 },
  { upTo: 93268, rate: 23.5 },
  { upTo: 123745, rate: 25 },
  { upTo: null, rate: 26 },
];

/** Cantabria — art. 1 TR Decreto Legislativo 62/2008, de 19 de junio. */
const IRPF_AUT_CANTABRIA: readonly Bracket[] = [
  { upTo: 13000, rate: 8.5 },
  { upTo: 21000, rate: 11 },
  { upTo: 35200, rate: 14.5 },
  { upTo: 60000, rate: 18 },
  { upTo: 90000, rate: 22.5 },
  { upTo: null, rate: 24.5 },
];

/**
 * Castilla-La Mancha — art. 13 bis Ley 8/2013, de 21 de noviembre. Única escala
 * idéntica a la supletoria del art. 65 LIRPF (suma 19 / 24 / 30 / 37 / 45 / 47).
 */
const IRPF_AUT_CASTILLA_LA_MANCHA: readonly Bracket[] = [
  { upTo: 12450, rate: 9.5 },
  { upTo: 20200, rate: 12 },
  { upTo: 35200, rate: 15 },
  { upTo: 60000, rate: 18.5 },
  { upTo: null, rate: 22.5 },
];

/** Castilla y León — art. 1 TR Decreto Legislativo 1/2013, de 12 de septiembre. */
const IRPF_AUT_CASTILLA_Y_LEON: readonly Bracket[] = [
  { upTo: 12450, rate: 9 },
  { upTo: 20200, rate: 12 },
  { upTo: 35200, rate: 14 },
  { upTo: 53407.2, rate: 18.5 },
  { upTo: null, rate: 21.5 },
];

/**
 * Cataluña — art. 611-1 Decreto Legislativo 1/2024, de 12 de marzo (libro sexto
 * del código tributario de Catalunya).
 */
const IRPF_AUT_CATALUNA: readonly Bracket[] = [
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
const IRPF_AUT_EXTREMADURA: readonly Bracket[] = [
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
const IRPF_AUT_GALICIA: readonly Bracket[] = [
  { upTo: 12985.35, rate: 9 },
  { upTo: 21068.6, rate: 11.65 },
  { upTo: 35200, rate: 14.9 },
  { upTo: 60000, rate: 18.4 },
  { upTo: null, rate: 22.5 },
];

/** Comunidad de Madrid — art. 1 TR Decreto Legislativo 1/2010, de 21 de octubre. */
const IRPF_AUT_MADRID: readonly Bracket[] = [
  { upTo: 13362.22, rate: 8.5 },
  { upTo: 19004.63, rate: 10.7 },
  { upTo: 35425.68, rate: 12.8 },
  { upTo: 57320.4, rate: 17.4 },
  { upTo: null, rate: 20.5 },
];

/** Región de Murcia — art. 2 TR Decreto Legislativo 1/2010, de 5 de noviembre. */
const IRPF_AUT_MURCIA: readonly Bracket[] = [
  { upTo: 12450, rate: 9.5 },
  { upTo: 20200, rate: 11.2 },
  { upTo: 34000, rate: 13.3 },
  { upTo: 60000, rate: 17.9 },
  { upTo: null, rate: 22.5 },
];

/** La Rioja — art. 31 Ley 10/2017, de 27 de octubre. */
const IRPF_AUT_LA_RIOJA: readonly Bracket[] = [
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
const IRPF_AUT_VALENCIANA: readonly Bracket[] = [
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
// Mínimo personal y familiar autonómico
// ---------------------------------------------------------------------------

/**
 * Importes del mínimo personal y familiar que modela el motor (arts. 57-60 LIRPF).
 * Los importes por tramo de edad son totales acumulados, no incrementos.
 */
export interface PersonalMinimumSchedule {
  /** Mínimo del contribuyente menor de 65 años. */
  readonly taxpayer: number;
  /** Mínimo del contribuyente de 65 a 74 años (total). */
  readonly taxpayer65: number;
  /** Mínimo del contribuyente de 75 años en adelante (total). */
  readonly taxpayer75: number;
  /** Mínimo por 1.º, 2.º, 3.º y 4.º descendiente y siguientes. */
  readonly descendants: readonly [number, number, number, number];
  /** Incremento por cada descendiente menor de 3 años. */
  readonly descendantUnder3: number;
  /** Mínimo por cada ascendiente mayor de 65 años a cargo. */
  readonly ascendant65: number;
  /** Incremento por discapacidad del contribuyente de grado 33-65 %. */
  readonly disability33: number;
  /** Incremento por discapacidad del contribuyente de grado ≥ 65 %. */
  readonly disability65: number;
}

/**
 * Mínimo estatal (arts. 57-60 LIRPF). Siempre alimenta la cuota estatal; el
 * autonómico solo la autonómica (art. 46.1.a Ley 22/2009).
 */
export const STATE_PERSONAL_MINIMUM: PersonalMinimumSchedule = {
  taxpayer: MINIMO_PERSONAL,
  taxpayer65: MINIMO_PERSONAL_65,
  taxpayer75: MINIMO_PERSONAL_75,
  descendants: MINIMO_DESCENDIENTES,
  descendantUnder3: MINIMO_DESCENDIENTE_MENOR_3,
  ascendant65: MINIMO_ASCENDIENTES,
  disability33: MINIMO_DISCAPACIDAD_33,
  disability65: MINIMO_DISCAPACIDAD_65,
};

// Importes del ejercicio 2025 (AEAT, Manual de Renta 2025, cuadro comparativo de
// mínimos). Los de 2026 aún no están publicados: continuidad no verificada.

/** Andalucía — mínimos propios. */
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

/** Principado de Asturias — mínimos propios. */
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

/** Canarias — mínimos propios. */
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

/** Galicia — mínimos propios. */
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

/** Comunidad de Madrid — mínimos propios. */
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

/** Comunitat Valenciana — mínimos propios. */
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
// Catálogo de comunidades
// ---------------------------------------------------------------------------

/** Comunidades autónomas de régimen común con escala propia del IRPF. */
export type RegionCode =
  | "andalucia"
  | "aragon"
  | "asturias"
  | "baleares"
  | "canarias"
  | "cantabria"
  | "castilla-la-mancha"
  | "castilla-y-leon"
  | "cataluna"
  | "extremadura"
  | "galicia"
  | "madrid"
  | "murcia"
  | "la-rioja"
  | "valencia";

/** Definición fiscal de una comunidad de régimen común. */
export interface RegionDefinition {
  /** Escala autonómica de la base liquidable general. */
  readonly scale: readonly Bracket[];
  /**
   * Mínimo personal y familiar autonómico, solo si la comunidad lo modifica en
   * alguno de los conceptos que este motor modela. Si falta, la cuota autonómica
   * usa el mínimo estatal.
   */
  readonly minimum?: PersonalMinimumSchedule;
}

export const REGIONS: Record<RegionCode, RegionDefinition> = {
  andalucia: { scale: IRPF_AUT_ANDALUCIA, minimum: MINIMUM_ANDALUCIA },
  aragon: { scale: IRPF_AUT_ARAGON },
  asturias: { scale: IRPF_AUT_ASTURIAS, minimum: MINIMUM_ASTURIAS },
  // Baleares sin mínimo propio a propósito: el cuadro de la AEAT es ambiguo (ver README).
  baleares: { scale: IRPF_AUT_BALEARES },
  canarias: { scale: IRPF_AUT_CANARIAS, minimum: MINIMUM_CANARIAS },
  cantabria: { scale: IRPF_AUT_CANTABRIA },
  "castilla-la-mancha": { scale: IRPF_AUT_CASTILLA_LA_MANCHA },
  "castilla-y-leon": { scale: IRPF_AUT_CASTILLA_Y_LEON },
  cataluna: { scale: IRPF_AUT_CATALUNA },
  extremadura: { scale: IRPF_AUT_EXTREMADURA },
  galicia: { scale: IRPF_AUT_GALICIA, minimum: MINIMUM_GALICIA },
  madrid: { scale: IRPF_AUT_MADRID, minimum: MINIMUM_MADRID },
  murcia: { scale: IRPF_AUT_MURCIA },
  // La Rioja solo difiere en la discapacidad de descendientes, que no se modela.
  "la-rioja": { scale: IRPF_AUT_LA_RIOJA },
  valencia: { scale: IRPF_AUT_VALENCIANA, minimum: MINIMUM_VALENCIANA },
};

/** Comunidades soportadas, en el orden en que se muestran en el selector. */
export const REGION_CODES: readonly RegionCode[] = [
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
];

/** Territorios que aparecen en el selector pero no se pueden calcular. */
export type UnsupportedRegionCode = "alava" | "bizkaia" | "gipuzkoa" | "navarra" | "ceuta-melilla";

/** Por qué un territorio no está soportado (alimenta el selector). */
export type UnsupportedRegionReason = "foral" | "ceutaMelilla";

export interface UnsupportedRegion {
  readonly code: UnsupportedRegionCode;
  readonly reason: UnsupportedRegionReason;
}

/**
 * Territorios que se muestran deshabilitados en el selector, con el motivo: omitirlos
 * haría creer que el resultado genérico les vale (foral y Ceuta/Melilla: ver README).
 */
export const UNSUPPORTED_REGIONS: readonly UnsupportedRegion[] = [
  { code: "alava", reason: "foral" },
  { code: "bizkaia", reason: "foral" },
  { code: "gipuzkoa", reason: "foral" },
  { code: "navarra", reason: "foral" },
  { code: "ceuta-melilla", reason: "ceutaMelilla" },
];

/**
 * Valor del selector de comunidad: una comunidad soportada, un territorio no
 * soportado (opción deshabilitada) o "" = sin especificar.
 */
export type RegionSelection = RegionCode | UnsupportedRegionCode | "";

/**
 * Selecciones realmente elegibles: sin comunidad ("") y las soportadas. Así una URL con
 * un territorio deshabilitado cae a "" en vez de dejar un estado inalcanzable desde la UI.
 */
export const SELECTABLE_REGIONS: readonly RegionSelection[] = ["", ...REGION_CODES];

/** Código del motor para una selección, o `undefined` si no hay comunidad o no está soportada. */
export function toSupportedRegion(selection: RegionSelection): RegionCode | undefined {
  return REGION_CODES.find((code) => code === selection);
}

/** Escala autonómica de una comunidad de régimen común. */
export function regionalScale(region: RegionCode): readonly Bracket[] {
  return REGIONS[region].scale;
}

/** Mínimo aplicable a la cuota autonómica: el propio de la comunidad o, si no, el estatal. */
export function regionalMinimumSchedule(region: RegionCode): PersonalMinimumSchedule {
  return REGIONS[region].minimum ?? STATE_PERSONAL_MINIMUM;
}
