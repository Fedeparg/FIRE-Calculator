import { Injectable, Logger } from '@nestjs/common';

import type { ReferenceRates } from '@sextante/core/fiscal/fx-reference';
import { buildIncomeReport, incomeRatesNeeded, type IncomeEvent, type IncomeYear } from '@sextante/core/fiscal/income';
import {
  buildRealisedGainsReport,
  referenceRatesNeeded,
  type RealisedGainsPosition,
  type RealisedGainsYear,
} from '@sextante/core/fiscal/realised-gains';
import { buildSavingsReturns, type SavingsReturn } from '@sextante/core/fiscal/savings-return';
import { ReferenceRatesService } from '../fx-reference/reference-rates.service.js';
import { IncomeService } from '../income/income.service.js';
import { PositionLotsService } from '../positions/position-lots.service.js';
import { PositionsService } from '../positions/positions.service.js';
import { PendingBalancesService } from './pending-balances.service.js';

/**
 * Base del ahorro de un ejercicio, montada en el servidor con las mismas funciones del core que
 * usa la web. La procedencia de cada cifra viaja dentro:
 * - ventas: `gains.sales[].eur` lleva el tipo del BCE aplicado a la venta (`sellRate`) y a cada
 *   compra (`buyRates`), con la fecha de la publicación usada;
 * - cobros: `incomeEvents[]` lleva `grossSource` y `withholdingOriginSource`
 *   (`broker` | `derived` | `market` | `estimate` | `manual`).
 */
export interface TaxReturnReport {
  /** Ejercicio del informe; `null` solo si no se pidió ninguno y el usuario no tiene datos. */
  year: number | null;
  /** Ejercicios con ventas o cobros, del más reciente al más antiguo. */
  availableYears: number[];
  /** Ventas del ejercicio (con su detalle y tipos aplicados), o `null` si no hubo. */
  gains: RealisedGainsYear | null;
  /** Resumen de cobros del ejercicio, o `null` si no hubo. */
  income: IncomeYear | null;
  /** Cobros del ejercicio uno a uno, con la procedencia de cada importe. */
  incomeEvents: IncomeEvent[];
  /** Base del ahorro del ejercicio (compensaciones, cuota, doble imposición), o `null` si no hay datos. */
  savings: SavingsReturn | null;
  /** `false` si hacían falta tipos del BCE y no se pudieron cargar: lo en divisa queda sin convertir. */
  ratesLoaded: boolean;
}

/**
 * Único punto de entrada del informe de la Renta (REST y MCP). Si algún día se cobra por el
 * informe, la comprobación del derecho de acceso va aquí, en `build`, y así cubre ambos canales.
 */
@Injectable()
export class TaxReturnService {
  private readonly logger = new Logger(TaxReturnService.name);

  constructor(
    private readonly positions: PositionsService,
    private readonly lots: PositionLotsService,
    private readonly income: IncomeService,
    private readonly pending: PendingBalancesService,
    private readonly referenceRates: ReferenceRatesService,
  ) {}

  /** Informe del ejercicio `year`; sin él, el último ejercicio con datos. */
  async build(userId: string, year?: number): Promise<TaxReturnReport> {
    const [positions, lots, incomeEvents, manualPending] = await Promise.all([
      this.positions.findAllByUser(userId),
      this.lots.findAllByUser(userId),
      this.income.list(userId),
      this.pending.list(userId),
    ]);

    const lotsByPosition = new Map<string, typeof lots>();
    for (const lot of lots) lotsByPosition.set(lot.positionId, [...(lotsByPosition.get(lot.positionId) ?? []), lot]);
    const input: RealisedGainsPosition[] = positions.map((p) => ({
      id: p.id,
      ticker: p.ticker,
      name: p.name,
      currency: p.currency,
      // Los derivados no están sujetos a la regla de los dos meses (DGT V2172-21).
      isDerivative: p.isDerivative,
      lots: lotsByPosition.get(p.id) ?? [],
    }));

    const { rates, ratesLoaded } = await this.loadRates(input, incomeEvents);
    const gains = buildRealisedGainsReport(input, rates).years;
    const income = buildIncomeReport(incomeEvents, rates).years;
    const returns = buildSavingsReturns({ gains, income, incomeEvents, rates, manualPending });

    const availableYears = returns.map((r) => r.year);
    const selected = year ?? availableYears[0] ?? null;
    return {
      year: selected,
      availableYears,
      gains: gains.find((y) => y.year === selected) ?? null,
      income: income.find((y) => y.year === selected) ?? null,
      incomeEvents: incomeEvents.filter((e) => e.paidAt.startsWith(String(selected))),
      savings: returns.find((r) => r.year === selected) ?? null,
      ratesLoaded,
    };
  }

  /** Tipos del BCE de las divisas de ventas y cobros; sin ellos el informe sale y marca lo no convertido. */
  private async loadRates(
    positions: readonly RealisedGainsPosition[],
    events: readonly IncomeEvent[],
  ): Promise<{ rates: ReferenceRates; ratesLoaded: boolean }> {
    const needed = [referenceRatesNeeded(positions), incomeRatesNeeded(events)].filter((n) => n !== null);
    if (needed.length === 0) return { rates: {}, ratesLoaded: true };
    const currencies = [...new Set(needed.flatMap((n) => n.currencies))].sort();
    const from = needed.map((n) => n.from).sort()[0];
    try {
      return { rates: await this.referenceRates.getRates(currencies, from), ratesLoaded: true };
    } catch (error) {
      this.logger.warn(
        `No se pudieron cargar los tipos del BCE: ${error instanceof Error ? error.message : String(error)}`,
      );
      return { rates: {}, ratesLoaded: false };
    }
  }
}
