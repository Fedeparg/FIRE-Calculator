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
 * A tax year's base del ahorro (savings tax base), built on the server with the same core
 * functions the web app uses. The provenance of every figure travels with it:
 * - sales: `gains.sales[].eur` carries the ECB rate applied to the sale (`sellRate`) and to each
 *   purchase (`buyRates`), with the date of the publication used;
 * - income payments: `incomeEvents[]` carries `grossSource` and `withholdingOriginSource`
 *   (`broker` | `derived` | `market` | `estimate` | `manual`).
 */
export interface TaxReturnReport {
  /** The report's tax year; `null` only if none was requested and the user has no data. */
  year: number | null;
  /** Tax years with sales or income payments, most recent first. */
  availableYears: number[];
  /** The year's sales (with their breakdown and applied rates), or `null` if there were none. */
  gains: RealisedGainsYear | null;
  /** Summary of the year's income payments, or `null` if there were none. */
  income: IncomeYear | null;
  /** The year's income payments one by one, with the provenance of each amount. */
  incomeEvents: IncomeEvent[];
  /** The year's savings base (offsets, tax due, double taxation), or `null` if there is no data. */
  savings: SavingsReturn | null;
  /** `false` if ECB rates were needed and could not be loaded: foreign-currency amounts stay unconverted. */
  ratesLoaded: boolean;
}

/** Realised gains of every tax year (or of one), for the MCP `get_realised_gains` tool. */
export interface RealisedGainsByYear {
  /** Tax years with sales, most recent first; only the requested one if one was given. */
  years: RealisedGainsYear[];
  /** `false` if ECB rates were needed and could not be loaded: foreign-currency amounts stay unconverted. */
  ratesLoaded: boolean;
}

/** Everything computed in one go for a user: every tax year, already composed. */
interface ComposedReturns {
  gains: RealisedGainsYear[];
  income: IncomeYear[];
  incomeEvents: IncomeEvent[];
  returns: SavingsReturn[];
  ratesLoaded: boolean;
}

/**
 * SERVER entry point of the Renta (income tax return) report: used by REST (`build`) and the two
 * MCP tools (`build` and `realisedGains`), which compose the report in a single place (`compose`).
 * The web app recomposes it on the client with the same core functions (`@sextante/core/fiscal/
 * report-inputs` and the `build*Report`s) to switch tax years without another request. If the
 * report is ever charged for, the entitlement check goes in `compose`, so it covers both REST and
 * MCP (the web app reads its data from the API, which would also have to check it).
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

  /** Report for tax year `year`; without it, the latest year with data. */
  async build(userId: string, year?: number): Promise<TaxReturnReport> {
    const { gains, income, incomeEvents, returns, ratesLoaded } = await this.compose(userId);

    const availableYears = returns.map((r) => r.year);
    const selected = year ?? availableYears[0] ?? null;
    return {
      year: selected,
      availableYears,
      gains: gains.find((y) => y.year === selected) ?? null,
      income: income.find((y) => y.year === selected) ?? null,
      // Without a selected year there are no payments: `String(null)` would compare against "null".
      incomeEvents: incomeEvents.filter((e) => selected !== null && Number(e.paidAt.slice(0, 4)) === selected),
      savings: returns.find((r) => r.year === selected) ?? null,
      ratesLoaded,
    };
  }

  /**
   * Realised gains of every tax year with sales, or only of `year`. Same computation as `build`
   * (and as the web app): if the ECB is down, it degrades with `ratesLoaded: false` instead of failing.
   */
  async realisedGains(userId: string, year?: number): Promise<RealisedGainsByYear> {
    const { gains, ratesLoaded } = await this.compose(userId);
    return { years: year === undefined ? gains : gains.filter((y) => y.year === year), ratesLoaded };
  }

  /** Reads the user's data and composes every tax year with the core functions. */
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

  /** ECB rates for the currencies of sales and payments; without them the report still renders and flags what is unconverted. */
  private async loadRates(
    positions: readonly RealisedGainsPosition[],
    events: readonly IncomeEvent[],
  ): Promise<{ rates: ReferenceRates; ratesLoaded: boolean }> {
    const needed = referenceRatesRequest(positions, events);
    if (!needed) return { rates: {}, ratesLoaded: true };
    try {
      return { rates: await this.referenceRates.getRates(needed.currencies, needed.from), ratesLoaded: true };
    } catch (error) {
      this.logger.warn(`Could not load the ECB rates: ${errorMessage(error)}`);
      return { rates: {}, ratesLoaded: false };
    }
  }
}
