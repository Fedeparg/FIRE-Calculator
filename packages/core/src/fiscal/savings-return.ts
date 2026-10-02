// La base del ahorro de un ejercicio completa: ganancias y pérdidas por venta, rendimientos del
// capital mobiliario, compensación (art. 49 LIRPF), cuota, deducción por doble imposición
// internacional (art. 80 LIRPF) y retenciones españolas. Core puro: une `realised-gains.ts`,
// `income.ts`, `savings-base.ts` y `double-taxation.ts`. Ver ./README.md.

import { computeDoubleTaxationDeduction, type DoubleTaxationResult } from "./double-taxation.js";
import { referenceRateOn, toEur, type ReferenceRates } from "./fx-reference.js";
import type { IncomeEvent, IncomeYear } from "./income.js";
import type { RealisedGainsYear } from "./realised-gains.js";
import {
  computeSavingsBase,
  savingsTax,
  type PendingNegative,
  type SavingsBaseResult,
  type SavingsTax,
} from "./savings-base.js";

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

  // Rendimientos de fuente extranjera, cobro a cobro y en euros (la retención puede no saberse).
  const foreign = input.incomeEvents.flatMap((event) => {
    if (!event.country || event.country === "ES") return [];
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

