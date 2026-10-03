// La base del ahorro de un ejercicio completa: ganancias y pérdidas por venta, rendimientos del
// capital mobiliario, compensación (art. 49 LIRPF), cuota, deducción por doble imposición
// internacional (art. 80 LIRPF) y retenciones españolas. Core puro: une `realised-gains.ts`,
// `income.ts`, `savings-base.ts`, `savings-tax.ts` y `double-taxation.ts`. Ver ./README.md.

import { computeDoubleTaxationDeduction, type DoubleTaxationResult } from "./double-taxation.js";
import { referenceRateOn, toEur, type ReferenceRates } from "./fx-reference.js";
import type { IncomeEvent, IncomeYear } from "./income.js";
import type { RealisedGainsYear } from "./realised-gains.js";
import { computeSavingsBase, type PendingNegative, type SavingsBaseResult } from "./savings-base.js";
import { savingsTax, type SavingsTax } from "./savings-tax.js";

export interface SavingsReturnInput {
  year: number;
  /** Ventas del ejercicio (`buildRealisedGainsReport`), o `undefined` si no hubo. */
  gains: RealisedGainsYear | undefined;
  /** Cobros del ejercicio resumidos (`buildIncomeReport`), o `undefined` si no hubo. */
  income: IncomeYear | undefined;
  /** Cobros del ejercicio, para la doble imposición país a país. */
  incomeEvents: readonly IncomeEvent[];
  rates: ReferenceRates;
  /** Saldos negativos de ejercicios anteriores pendientes de compensar. */
  pending: readonly PendingNegative[];
}

export interface SavingsReturn {
  year: number;
  /** Saldo de ganancias y pérdidas por transmisión (ventas + diferencias de cambio). */
  gainsBalance: number;
  /** Rendimiento neto del capital mobiliario (íntegros; sin gastos deducibles registrados). */
  capitalIncomeBalance: number;
  savingsBase: SavingsBaseResult;
  /** Cuota íntegra del ahorro y tipo medio. */
  tax: SavingsTax;
  doubleTaxation: DoubleTaxationResult;
  /** Cuota tras la deducción por doble imposición. */
  netTax: number;
  /** Retenciones españolas de los cobros: se restan después, en la cuota diferencial. */
  withholdingSpain: number;
  /** Lo que la base del ahorro aporta al resultado de la declaración: cuota − retenciones. */
  result: number;
  /**
   * La cifra no está completa: hay ventas o cobros sin tipo de cambio, o dividendos extranjeros
   * sin retención en origen conocida.
   */
  incomplete: boolean;
}

/** Calcula la base del ahorro del ejercicio de principio a fin. */
export function buildSavingsReturn(input: SavingsReturnInput): SavingsReturn {
  const { gains, income } = input;
  const gainsBalance = gains?.total ?? 0;
  const capitalIncomeBalance = income ? income.interest.total.gross + income.dividend.total.gross : 0;

  const savingsBase = computeSavingsBase({
    year: input.year,
    gainsBalance,
    capitalIncomeBalance,
    pending: input.pending,
  });
  const tax = savingsTax(savingsBase.base);

  // Rendimientos gravados en el extranjero (art. 80.1.b), cobro a cobro y en euros. Lo que no pagó
  // nada fuera (intereses de la cuenta alemana de TR) no entra: inflaría el límite del tipo medio.
  // Con la retención desconocida sí, para que la doble imposición avise de que falta.
  const foreign = input.incomeEvents.flatMap((event) => {
    if (!event.country || event.country === "ES" || event.withholdingOrigin === 0) return [];
    const rate = referenceRateOn(input.rates, event.currency, event.paidAt);
    if (!rate) return [];
    return [
      {
        country: event.country,
        gross: toEur(event.gross, rate),
        withholdingOrigin: event.withholdingOrigin === null ? null : toEur(event.withholdingOrigin, rate),
      },
    ];
  });
  const doubleTaxation = computeDoubleTaxationDeduction(foreign, tax.averageRatePct);
  const netTax = Math.max(0, tax.tax - doubleTaxation.deduction);
  const withholdingSpain = income ? income.interest.total.withholdingSpain + income.dividend.total.withholdingSpain : 0;

  return {
    year: input.year,
    gainsBalance,
    capitalIncomeBalance,
    savingsBase,
    tax,
    doubleTaxation,
    netTax,
    withholdingSpain,
    result: netTax - withholdingSpain,
    incomplete:
      (gains?.unconverted.length ?? 0) > 0 || (income?.unconverted.length ?? 0) > 0 || (income?.originUnknown ?? 0) > 0,
  };
}

export interface SavingsReturnsInput {
  gains: readonly RealisedGainsYear[];
  income: readonly IncomeYear[];
  incomeEvents: readonly IncomeEvent[];
  rates: ReferenceRates;
  /**
   * Saldos negativos pendientes al empezar el primer ejercicio que calcula Sextante, de años que
   * no calcula (los copia el usuario de su última declaración).
   */
  manualPending: readonly PendingNegative[];
}

/**
 * La base del ahorro de todos los ejercicios con datos, en orden, arrastrando de uno a otro los
 * saldos negativos pendientes (art. 49 LIRPF: cuatro años). Los años intermedios sin datos
 * también se recorren, para que los saldos caduquen cuando toca. Devuelve los ejercicios con
 * ventas o cobros, del más reciente al más antiguo.
 */
export function buildSavingsReturns(input: SavingsReturnsInput): SavingsReturn[] {
  const gainsByYear = new Map(input.gains.map((y) => [y.year, y]));
  const incomeByYear = new Map(input.income.map((y) => [y.year, y]));
  const years = [...new Set([...gainsByYear.keys(), ...incomeByYear.keys()])].sort((a, b) => a - b);
  if (years.length === 0) return [];

  const out: SavingsReturn[] = [];
  let carried: PendingNegative[] = [...input.manualPending];
  for (let year = years[0]; year <= years[years.length - 1]; year++) {
    const result = buildSavingsReturn({
      year,
      gains: gainsByYear.get(year),
      income: incomeByYear.get(year),
      incomeEvents: input.incomeEvents.filter((event) => event.paidAt.startsWith(String(year))),
      rates: input.rates,
      pending: carried,
    });
    carried = [...result.savingsBase.pending];
    if (gainsByYear.has(year) || incomeByYear.has(year)) out.push(result);
  }
  return out.reverse();
}
