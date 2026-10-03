import { Injectable, Logger } from '@nestjs/common';

import type { ReferenceRates } from '@sextante/core/fiscal/fx-reference';
import { buildIncomeReport, type IncomeEvent, type IncomeYear } from '@sextante/core/fiscal/income';
import {
  buildRealisedGainsReport,
  type RealisedGainsPosition,
  type RealisedGainsYear,
} from '@sextante/core/fiscal/realised-gains';
import { referenceRatesRequest, toRealisedGainsPositions } from '@sextante/core/fiscal/report-inputs';
import { buildSavingsReturns, type SavingsReturn } from '@sextante/core/fiscal/savings-return';
import { ReferenceRatesService } from '../fx-reference/reference-rates.service.js';
import { IncomeService } from '../income/income.service.js';
import { PositionLotsService } from '../positions/position-lots.service.js';
import { PositionsService } from '../positions/positions.service.js';
import { PendingBalancesService } from './pending-balances.service.js';
import { errorMessage } from '../common/errors.js';

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

/** Plusvalías realizadas de todos los ejercicios (o de uno), para `get_realised_gains` del MCP. */
export interface RealisedGainsByYear {
  /** Ejercicios con ventas, del más reciente al más antiguo; solo el pedido si se indicó uno. */
  years: RealisedGainsYear[];
  /** `false` si hacían falta tipos del BCE y no se pudieron cargar: lo en divisa queda sin convertir. */
  ratesLoaded: boolean;
}

/** Todo lo que se calcula de una vez para un usuario: cada ejercicio, ya compuesto. */
interface ComposedReturns {
  gains: RealisedGainsYear[];
  income: IncomeYear[];
  incomeEvents: IncomeEvent[];
  returns: SavingsReturn[];
  ratesLoaded: boolean;
}

/**
 * Punto de entrada del informe de la Renta en el SERVIDOR: lo usan REST (`build`) y las dos tools
 * del MCP (`build` y `realisedGains`), que componen el informe en un único sitio (`compose`). La
 * web lo recompone en el cliente con las mismas funciones del core (`@sextante/core/fiscal/
 * report-inputs` y los `build*Report`) para cambiar de ejercicio sin otra petición. Si algún día
 * se cobra por el informe, la comprobación del derecho de acceso va en `compose`, y así cubre REST
 * y MCP (la web lee sus datos de la API, que también tendría que comprobarlo).
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
    const { gains, income, incomeEvents, returns, ratesLoaded } = await this.compose(userId);

    const availableYears = returns.map((r) => r.year);
    const selected = year ?? availableYears[0] ?? null;
    return {
      year: selected,
      availableYears,
      gains: gains.find((y) => y.year === selected) ?? null,
      income: income.find((y) => y.year === selected) ?? null,
      // Sin ejercicio seleccionado no hay cobros: `String(null)` compararía con "null".
      incomeEvents: incomeEvents.filter((e) => selected !== null && Number(e.paidAt.slice(0, 4)) === selected),
      savings: returns.find((r) => r.year === selected) ?? null,
      ratesLoaded,
    };
  }

  /**
   * Plusvalías realizadas de todos los ejercicios con ventas, o solo de `year`. Mismo cálculo que
   * `build` (y que la web): si cae el BCE, degrada con `ratesLoaded: false` en vez de fallar.
   */
  async realisedGains(userId: string, year?: number): Promise<RealisedGainsByYear> {
    const { gains, ratesLoaded } = await this.compose(userId);
    return { years: year === undefined ? gains : gains.filter((y) => y.year === year), ratesLoaded };
  }

  /** Lee los datos del usuario y compone todos los ejercicios con las funciones del core. */
  private async compose(userId: string): Promise<ComposedReturns> {
    const [positions, lots, incomeEvents, manualPending] = await Promise.all([
      this.positions.findAllByUser(userId),
      this.lots.findAllByUser(userId),
      this.income.list(userId),
      this.pending.list(userId),
    ]);

    const input = toRealisedGainsPositions(positions, lots);
    const { rates, ratesLoaded } = await this.loadRates(input, incomeEvents);
    const gains = buildRealisedGainsReport(input, rates).years;
    const income = buildIncomeReport(incomeEvents, rates).years;
    const returns = buildSavingsReturns({ gains, income, incomeEvents, rates, manualPending });
    return { gains, income, incomeEvents, returns, ratesLoaded };
  }

  /** Tipos del BCE de las divisas de ventas y cobros; sin ellos el informe sale y marca lo no convertido. */
  private async loadRates(
    positions: readonly RealisedGainsPosition[],
    events: readonly IncomeEvent[],
  ): Promise<{ rates: ReferenceRates; ratesLoaded: boolean }> {
    const needed = referenceRatesRequest(positions, events);
    if (!needed) return { rates: {}, ratesLoaded: true };
    try {
      return { rates: await this.referenceRates.getRates(needed.currencies, needed.from), ratesLoaded: true };
    } catch (error) {
      this.logger.warn(`No se pudieron cargar los tipos del BCE: ${errorMessage(error)}`);
      return { rates: {}, ratesLoaded: false };
    }
  }
}
