// Deducción por doble imposición internacional (art. 80 LIRPF) sobre rentas del ahorro.
// Core puro: los avisos son códigos, no texto. Alcance y fuentes: ver ./README.md.

import { nonNegative } from "../inputs.js";
import { countryColumn } from "./countries.js";

/**
 * Tipo máximo (%) que el convenio de doble imposición permite al país de la fuente sobre
 * dividendos pagados a un residente en España. Vista de `COUNTRY_DIVIDEND_RATES` (countries.ts),
 * donde están el dato y sus fuentes; un país ausente no tiene dato confirmado.
 */
export const TREATY_DIVIDEND_RATES: Readonly<Record<string, number>> = countryColumn((rates) => rates.treatyPct);

/**
 * Países sin convenio con España: la deducción del art. 80 LIRPF no tiene el límite de un convenio
 * y alcanza todo el impuesto satisfecho (con el límite del tipo medio). Dinamarca, sin convenio
 * desde el 01/01/2009 (AEAT, folleto "Residentes con rentas en Dinamarca"); Islas Caimán, sin
 * convenio.
 */
export const NO_TREATY_COUNTRIES: ReadonlySet<string> = new Set(["DK", "KY"]);

/** Renta bruta del extranjero de un país (ISO 3166-1 alfa-2), en euros. */
export interface ForeignIncome {
  readonly country: string;
  readonly gross: number;
  /** Retención soportada en origen en euros; `null` si se desconoce. */
  readonly withholdingOrigin: number | null;
}

export type DoubleTaxationWarningCode = "origin_unknown" | "no_treaty_rate" | "excess_withholding";

export interface DoubleTaxationWarning {
  readonly code: DoubleTaxationWarningCode;
  readonly country: string;
  /** `no_treaty_rate`: retención sin deducir; `excess_withholding`: exceso reclamable; `origin_unknown`: bruto sin retención conocida. */
  readonly amount: number;
}

export interface CountryDeduction {
  readonly country: string;
  readonly gross: number;
  /** Suma de las retenciones conocidas. */
  readonly withholdingOrigin: number;
  /** Bruto cuya retención se desconoce (no deduce nada). */
  readonly unknownGross: number;
  readonly treatyRatePct: number | null;
  /** Impuesto acreditable: mín(retención, tipo del convenio × íntegro). */
  readonly creditable: number;
  /** Retención por encima del convenio, reclamable al fisco del país de origen. */
  readonly excessReclaimable: number;
}

export interface DoubleTaxationResult {
  readonly countries: readonly CountryDeduction[];
  readonly creditableTotal: number;
  /** Tipo medio efectivo aplicado, en % y con dos decimales (art. 80.2 LIRPF). */
  readonly averageRatePct: number;
  /** Límite b) del art. 80.1: tipo medio efectivo × íntegro extranjero. */
  readonly limit: number;
  /** Deducción total: mín(acreditable total, límite). */
  readonly deduction: number;
  readonly limitedByAverageRate: boolean;
  readonly warnings: readonly DoubleTaxationWarning[];
}

interface Acc {
  gross: number;
  withholding: number;
  unknownGross: number;
  creditable: number;
  excess: number;
  noTreatyWithholding: number;
}

/**
 * Deducción por doble imposición internacional (art. 80.1 LIRPF): la menor de a) lo
 * satisfecho en el extranjero y b) el tipo medio efectivo × la renta gravada fuera.
 *
 * Decisión de prudencia: la deducción a) se acota al tipo del convenio (lo demás se debe
 * reclamar en origen, no es impuesto «efectivamente debido»). Sin tipo confirmado en
 * `TREATY_DIVIDEND_RATES` no se deduce nada y se avisa (`no_treaty_rate`); con retención
 * desconocida tampoco (`origin_unknown`). El límite se calcula sobre todo el íntegro extranjero.
 */
export function computeDoubleTaxationDeduction(
  incomes: readonly ForeignIncome[],
  averageRatePct: number | null,
): DoubleTaxationResult {
  const byCountry = new Map<string, Acc>();

  for (const income of incomes) {
    const country = income.country.trim().toUpperCase();
    const acc = byCountry.get(country) ?? {
      gross: 0,
      withholding: 0,
      unknownGross: 0,
      creditable: 0,
      excess: 0,
      noTreatyWithholding: 0,
    };
    byCountry.set(country, acc);
    const gross = nonNegative(income.gross);
    acc.gross += gross;

    if (income.withholdingOrigin === null || !Number.isFinite(income.withholdingOrigin)) {
      acc.unknownGross += gross;
      continue;
    }
    const withholding = nonNegative(income.withholdingOrigin);
    acc.withholding += withholding;
    const rate = TREATY_DIVIDEND_RATES[country];
    if (rate === undefined) {
      if (NO_TREATY_COUNTRIES.has(country)) acc.creditable += withholding;
      else acc.noTreatyWithholding += withholding;
      continue;
    }
    const creditable = Math.min(withholding, (rate / 100) * gross);
    acc.creditable += creditable;
    acc.excess += withholding - creditable;
  }

  const countries: CountryDeduction[] = [];
  const warnings: DoubleTaxationWarning[] = [];
  for (const [country, acc] of [...byCountry.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    countries.push({
      country,
      gross: acc.gross,
      withholdingOrigin: acc.withholding,
      unknownGross: acc.unknownGross,
      treatyRatePct: TREATY_DIVIDEND_RATES[country] ?? null,
      creditable: acc.creditable,
      excessReclaimable: acc.excess,
    });
    if (acc.unknownGross > 0) warnings.push({ code: "origin_unknown", country, amount: acc.unknownGross });
    if (acc.noTreatyWithholding > 0)
      warnings.push({ code: "no_treaty_rate", country, amount: acc.noTreatyWithholding });
    if (acc.excess > 0) warnings.push({ code: "excess_withholding", country, amount: acc.excess });
  }

  const creditableTotal = countries.reduce((s, c) => s + c.creditable, 0);
  const grossTotal = countries.reduce((s, c) => s + c.gross, 0);
  const rate =
    averageRatePct !== null && Number.isFinite(averageRatePct)
      ? Math.max(0, Math.round(averageRatePct * 100) / 100)
      : 0;
  const limit = (rate / 100) * grossTotal;
  const deduction = Math.min(creditableTotal, limit);
  return {
    countries,
    creditableTotal,
    averageRatePct: rate,
    limit,
    deduction,
    limitedByAverageRate: limit < creditableTotal,
    warnings,
  };
}
