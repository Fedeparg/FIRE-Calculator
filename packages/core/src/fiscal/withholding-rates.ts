// Retención que aplica de hecho el país de la fuente a los dividendos de una persona física
// residente en España, para ESTIMAR la retención en origen cuando ni el bróker ni el dato de
// mercado la dan (`dividend-resolution.ts`, capa 3). Toda cifra que salga de aquí se marca como
// estimación. Contrastado el 2026-10-03: ver ./README.md, sección `withholding-rates.ts`.

/** Tipo (en tanto por uno) y de dónde sale. */
export interface StatutoryWithholding {
  rate: number;
  source: string;
}

const PWC = (country: string) => `PwC Worldwide Tax Summaries, ${country}, withholding taxes`;

/**
 * Por país (ISO 3166-1 alfa-2). Quedan fuera los países donde el tipo depende de algo que no
 * sabemos: Irlanda (25 %, o 0 % con la declaración de no residente) y Australia (30 % o 0 % según
 * el dividendo esté "franked").
 */
export const STATUTORY_DIVIDEND_WITHHOLDING: Readonly<Record<string, StatutoryWithholding>> = {
  // Con el W-8BEN que tramitan los brókers: el tipo del convenio. Sin él, 30 %.
  US: { rate: 0.15, source: "IRS, Tax Treaty Table 1 (España: 15 % en dividendos)" },
  DE: { rate: 0.26375, source: `${PWC("Germany")}: 25 % + 5,5 % de recargo de solidaridad` },
  FR: { rate: 0.128, source: `${PWC("France")}: 12,8 % a personas físicas (art. 187 CGI)` },
  NL: { rate: 0.15, source: PWC("Netherlands") },
  GB: { rate: 0, source: "AEAT, folleto Residentes con rentas en Reino Unido; sin retención interna" },
  CH: { rate: 0.35, source: PWC("Switzerland") },
  IT: { rate: 0.26, source: PWC("Italy") },
  BE: { rate: 0.3, source: PWC("Belgium") },
  DK: { rate: 0.27, source: PWC("Denmark") },
  FI: { rate: 0.3, source: "Vero (Agencia Tributaria de Finlandia), dividendos a no residentes" },
  SE: { rate: 0.3, source: PWC("Sweden") },
  NO: { rate: 0.25, source: PWC("Norway") },
  CA: { rate: 0.25, source: PWC("Canada") },
  JP: { rate: 0.15315, source: `${PWC("Japan")}: 15 % + 2,1 % de recargo, cotizadas` },
  CN: { rate: 0.1, source: "Circular Guo Shui Han [2011] 348 (acciones H); convenio BOE-A-2021-4911" },
  HK: { rate: 0, source: PWC("Hong Kong") },
  KY: { rate: 0, source: PWC("Cayman Islands") },
  LU: { rate: 0.15, source: PWC("Luxembourg") },
};
