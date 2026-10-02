// Rendimientos del capital mobiliario del ejercicio (art. 25 LIRPF): dividendos, intereses y las
// recompensas que el bróker declara como intereses (saveback). Core puro. Alcance y fuentes: ver
// ./README.md, sección `income.ts`.

import { referenceRateOn, TAX_CURRENCY, toEur, type ReferenceRates } from "./fx-reference.js";

export const INCOME_KINDS = ["dividend", "interest", "benefit"] as const;
/**
 * `benefit`: recompensa en efectivo del bróker (saveback, stockperk). Se declara como intereses
 * (casilla de intereses de cuentas), igual que hace el propio bróker.
 */
export type IncomeKind = (typeof INCOME_KINDS)[number];

export const INCOME_SOURCES = ["manual", "trade_republic"] as const;
export type IncomeSource = (typeof INCOME_SOURCES)[number];

/** Un cobro, tal y como lo sirve `GET /api/income`. Importes en `currency`. */
export interface IncomeEvent {
  id: string;
  /** Posición de la que sale, si la hay (los intereses de cuenta no tienen). */
  positionId: string | null;
  kind: IncomeKind;
  /** Fecha de cobro (`YYYY-MM-DD`): decide el ejercicio. */
  paidAt: string;
  isin: string | null;
  /** Valor o cuenta de la que sale. */
  name: string | null;
  /** País de la fuente (ISO 3166-1 alfa-2), para la doble imposición. */
  country: string | null;
  currency: string;
  /** Íntegro: antes de cualquier retención. Negativo en una anulación del bróker. */
  gross: number;
  /** Retención practicada en el país de la fuente; `null` si no se sabe. */
  withholdingOrigin: number | null;
  /** Retención practicada en España (ingreso a cuenta del IRPF). */
  withholdingSpain: number;
  /** El pagador ya lo comunicó a la AEAT: puede aparecer en el borrador. */
  reportedToAeat: boolean;
  source: IncomeSource;
  createdAt: string;
}

/** Alta o edición de un cobro (`POST`/`PATCH /api/income`). */
export interface IncomePayload {
  kind: IncomeKind;
  paidAt: string;
  positionId?: string | null;
  isin?: string | null;
  name?: string | null;
  country?: string | null;
  currency?: string;
  gross: number;
  withholdingOrigin?: number | null;
  withholdingSpain?: number;
  reportedToAeat?: boolean;
}

/** Agrupación de la declaración: intereses (incluye recompensas) o dividendos. */
export type IncomeCategory = "interest" | "dividend";

export function incomeCategoryOf(kind: IncomeKind): IncomeCategory {
  return kind === "dividend" ? "dividend" : "interest";
}

/** Sumas en euros de un conjunto de cobros. */
export interface IncomeTotals {
  events: number;
  gross: number;
  withholdingOrigin: number;
  withholdingSpain: number;
  /** Lo cobrado: íntegro − retenciones. */
  net: number;
}

export interface IncomeCountryTotals extends IncomeTotals {
  country: string | null;
}

export interface IncomeCategoryReport {
  category: IncomeCategory;
  total: IncomeTotals;
  /** Lo que el pagador ya comunicó a la AEAT: puede estar en el borrador. */
  reported: IncomeTotals;
  /** Lo que hay que añadir a mano a la declaración. */
  pending: IncomeTotals;
  /** Por país de la fuente, el de más íntegro primero. */
  byCountry: IncomeCountryTotals[];
}

export interface IncomeYear {
  year: number;
  interest: IncomeCategoryReport;
  dividend: IncomeCategoryReport;
  /** Cobros sin tipo del BCE el día de cobro, por divisa: fuera de los totales. */
  unconverted: { currency: string; events: number }[];
  /** Dividendos extranjeros sin retención en origen conocida (la doble imposición no se puede calcular). */
  originUnknown: number;
}

export interface IncomeReport {
  /** Ejercicios con algún cobro, del más reciente al más antiguo. */
  years: IncomeYear[];
}

const emptyTotals = (): IncomeTotals => ({ events: 0, gross: 0, withholdingOrigin: 0, withholdingSpain: 0, net: 0 });

function add(totals: IncomeTotals, gross: number, origin: number, spain: number): void {
  totals.events += 1;
  totals.gross += gross;
  totals.withholdingOrigin += origin;
  totals.withholdingSpain += spain;
  totals.net += gross - origin - spain;
}

function emptyCategory(
  category: IncomeCategory,
): IncomeCategoryReport & { countries: Map<string, IncomeCountryTotals> } {
  return {
    category,
    total: emptyTotals(),
    reported: emptyTotals(),
    pending: emptyTotals(),
    byCountry: [],
    countries: new Map(),
  };
}

/** Divisas distintas del euro de los cobros y su fecha más antigua, para pedir los tipos del BCE. */
export function incomeRatesNeeded(events: readonly IncomeEvent[]): { currencies: string[]; from: string } | null {
  const currencies = new Set<string>();
  let from: string | null = null;
  for (const event of events) {
    if (event.currency === TAX_CURRENCY) continue;
    currencies.add(event.currency);
    if (from === null || event.paidAt < from) from = event.paidAt;
  }
  return from === null ? null : { currencies: [...currencies].sort(), from };
}

/**
 * Resumen por ejercicio de los rendimientos del capital mobiliario, en euros. Los cobros en
 * divisa se convierten con el tipo del BCE del día de cobro; sin tipo, quedan fuera de los totales.
 */
export function buildIncomeReport(events: readonly IncomeEvent[], rates: ReferenceRates): IncomeReport {
  const byYear = new Map<number, IncomeEvent[]>();
  for (const event of events) {
    const year = Number(event.paidAt.slice(0, 4));
    if (!Number.isInteger(year)) continue;
    byYear.set(year, [...(byYear.get(year) ?? []), event]);
  }
  const years = [...byYear.entries()].sort(([a], [b]) => b - a).map(([year, list]) => buildYear(year, list, rates));
  return { years };
}

function buildYear(year: number, events: readonly IncomeEvent[], rates: ReferenceRates): IncomeYear {
  const categories = { interest: emptyCategory("interest"), dividend: emptyCategory("dividend") };
  const unconverted = new Map<string, number>();
  let originUnknown = 0;

  for (const event of events) {
    const rate = referenceRateOn(rates, event.currency, event.paidAt);
    if (!rate) {
      unconverted.set(event.currency, (unconverted.get(event.currency) ?? 0) + 1);
      continue;
    }
    const gross = toEur(event.gross, rate);
    const origin = event.withholdingOrigin === null ? 0 : toEur(event.withholdingOrigin, rate);
    const spain = toEur(event.withholdingSpain, rate);
    if (event.kind === "dividend" && event.withholdingOrigin === null && event.country !== "ES") originUnknown += 1;

    const category = categories[incomeCategoryOf(event.kind)];
    add(category.total, gross, origin, spain);
    add(event.reportedToAeat ? category.reported : category.pending, gross, origin, spain);
    const key = event.country ?? "";
    const country = category.countries.get(key) ?? { country: event.country, ...emptyTotals() };
    add(country, gross, origin, spain);
    category.countries.set(key, country);
  }

  const finish = ({ countries, ...category }: ReturnType<typeof emptyCategory>): IncomeCategoryReport => ({
    ...category,
    byCountry: [...countries.values()].sort((a, b) => b.gross - a.gross),
  });

  return {
    year,
    interest: finish(categories.interest),
    dividend: finish(categories.dividend),
    unconverted: [...unconverted.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([currency, count]) => ({ currency, events: count })),
    originUnknown,
  };
}
