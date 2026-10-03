// Tipos de retención sobre dividendos por país de la fuente (ISO 3166-1 alfa-2), todos en %, en
// un solo registro. De aquí salen las tres vistas que usa el motor fiscal, cada una con su
// unidad en el borde:
//   - `TREATY_DIVIDEND_RATES` (double-taxation.ts, en %): límite del convenio para la deducción
//     por doble imposición internacional (art. 80 LIRPF);
//   - `STATUTORY_DIVIDEND_WITHHOLDING` (withholding-rates.ts, en tanto por uno): lo que retiene de
//     hecho el país, para ESTIMAR la retención en origen;
//   - `BROKER_ORIGIN_RATES` (dividend-resolution.ts, en tanto por uno): lo que retiene el bróker.
// Fuentes de cada columna: ver los campos de `CountryDividendRates` y ./README.md. Core puro.

/** Retención española sobre rendimientos del capital mobiliario y del ahorro, en % (art. 90 RIRPF). */
export const SPAIN_SAVINGS_WITHHOLDING_PCT = 19;

/** Retención que aplica de hecho el país y de dónde sale el dato. */
export interface StatutoryDividendRate {
  readonly pct: number;
  readonly source: string;
}

export interface CountryDividendRates {
  /**
   * Tipo máximo (%) que el convenio con España permite al país de la fuente sobre dividendos a un
   * residente en España (columna «General», no matriz-filial). Fuente: DGT, «Límites de
   * imposición sobre dividendos, intereses y cánones resultantes de los CDI suscritos por España»
   * (actualización 01/01/2018),
   * https://www.hacienda.gob.es/SGT/NormativaDoctrina/Tributaria/CDI/Documentacion/Limites_Imposicion_CDI.pdf
   * Solo entran países con tipo único y sin nota al pie en esa columna; ausente = sin dato
   * confirmado. La tabla es de 2018 y se contrasta con los convenios posteriores:
   * - Japón: 5 % desde el convenio de 2018, en vigor el 01/05/2021 (BOE-A-2021-2977, art. 10.2).
   * - Irlanda: 0 %. El art. 10.1.c) del convenio exime en Irlanda los dividendos del residente en
   *   España; el 15 % de la tabla es la letra b) (régimen de crédito fiscal). Lo que retenga
   *   Irlanda (25 % de DWT) no se deduce en España: se reclama a Revenue con el formulario V2A.
   */
  readonly treatyPct?: number;
  /**
   * Retención que aplica de hecho el país a una persona física residente en España (contrastado
   * el 2026-10-03). Quedan fuera los países donde depende de algo que no sabemos: Irlanda (25 %,
   * o 0 % con la declaración de no residente) y Australia (30 % o 0 % según el dividendo esté
   * "franked").
   */
  readonly statutory?: StatutoryDividendRate;
  /**
   * Retención en origen que el bróker aplica de hecho y coincide con el convenio, para deshacer
   * la mezcla de retenciones del export de Trade Republic: EE. UU. con el W-8BEN (confirmado con
   * 21 dividendos reales contra el informe fiscal de TR) y Países Bajos (ASML).
   */
  readonly brokerAppliedPct?: number;
}

const PWC = (country: string) => `PwC Worldwide Tax Summaries, ${country}, withholding taxes`;

export const COUNTRY_DIVIDEND_RATES: Readonly<Record<string, CountryDividendRates>> = {
  AT: { treatyPct: 15 },
  AU: { treatyPct: 15 },
  BE: { treatyPct: 15, statutory: { pct: 30, source: PWC("Belgium") } },
  CA: { treatyPct: 15, statutory: { pct: 25, source: PWC("Canada") } },
  CH: { treatyPct: 15, statutory: { pct: 35, source: PWC("Switzerland") } },
  CN: {
    treatyPct: 10,
    statutory: { pct: 10, source: "Circular Guo Shui Han [2011] 348 (acciones H); convenio BOE-A-2021-4911" },
  },
  DE: {
    treatyPct: 15,
    statutory: { pct: 26.375, source: `${PWC("Germany")}: 25 % + 5,5 % de recargo de solidaridad` },
  },
  // Sin convenio desde el 01/01/2009: ver `NO_TREATY_COUNTRIES`.
  DK: { statutory: { pct: 27, source: PWC("Denmark") } },
  FI: {
    treatyPct: 15,
    statutory: { pct: 30, source: "Vero (Agencia Tributaria de Finlandia), dividendos a no residentes" },
  },
  FR: { treatyPct: 15, statutory: { pct: 12.8, source: `${PWC("France")}: 12,8 % a personas físicas (art. 187 CGI)` } },
  GB: {
    treatyPct: 10,
    statutory: { pct: 0, source: "AEAT, folleto Residentes con rentas en Reino Unido; sin retención interna" },
  },
  HK: { treatyPct: 10, statutory: { pct: 0, source: PWC("Hong Kong") } },
  IE: { treatyPct: 0 },
  IT: { treatyPct: 15, statutory: { pct: 26, source: PWC("Italy") } },
  JP: { treatyPct: 5, statutory: { pct: 15.315, source: `${PWC("Japan")}: 15 % + 2,1 % de recargo, cotizadas` } },
  KR: { treatyPct: 15 },
  // Sin convenio: ver `NO_TREATY_COUNTRIES`.
  KY: { statutory: { pct: 0, source: PWC("Cayman Islands") } },
  LU: { treatyPct: 15, statutory: { pct: 15, source: PWC("Luxembourg") } },
  NL: { treatyPct: 15, statutory: { pct: 15, source: PWC("Netherlands") }, brokerAppliedPct: 15 },
  NO: { treatyPct: 15, statutory: { pct: 25, source: PWC("Norway") } },
  PT: { treatyPct: 15 },
  SE: { treatyPct: 15, statutory: { pct: 30, source: PWC("Sweden") } },
  US: {
    treatyPct: 15,
    // Con el W-8BEN que tramitan los brókers: el tipo del convenio. Sin él, 30 %.
    statutory: { pct: 15, source: "IRS, Tax Treaty Table 1 (España: 15 % en dividendos)" },
    brokerAppliedPct: 15,
  },
};

/** Vista de una columna del registro: los países que la tienen, con su valor. */
export function countryColumn<T>(pick: (rates: CountryDividendRates) => T | undefined): Readonly<Record<string, T>> {
  const column: Record<string, T> = {};
  for (const [country, rates] of Object.entries(COUNTRY_DIVIDEND_RATES)) {
    const value = pick(rates);
    if (value !== undefined) column[country] = value;
  }
  return column;
}
