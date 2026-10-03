// Retención que aplica de hecho el país de la fuente a los dividendos de una persona física
// residente en España, para ESTIMAR la retención en origen cuando ni el bróker ni el dato de
// mercado la dan (`dividend-resolution.ts`, capa 3). Toda cifra que salga de aquí se marca como
// estimación. Los datos y sus fuentes viven en `countries.ts` (en %); aquí, en tanto por uno.
// Contrastado el 2026-10-03: ver ./README.md, sección `withholding-rates.ts`.

import { countryColumn } from "./countries.js";

/** Tipo (en tanto por uno) y de dónde sale. */
export interface StatutoryWithholding {
  rate: number;
  source: string;
}

/** Por país (ISO 3166-1 alfa-2); ausente si el tipo depende de algo que no sabemos (ver `countries.ts`). */
export const STATUTORY_DIVIDEND_WITHHOLDING: Readonly<Record<string, StatutoryWithholding>> = countryColumn(
  (rates) => rates.statutory && { rate: rates.statutory.pct / 100, source: rates.statutory.source },
);
