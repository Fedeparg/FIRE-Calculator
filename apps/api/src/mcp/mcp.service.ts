import { Inject, Injectable } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { IncomeService } from '../income/income.service.js';
import { PortfolioSnapshotsService } from '../portfolio/portfolio-snapshots.service.js';
import { PortfolioValuationService } from '../portfolio/portfolio-valuation.service.js';
import { PositionLotsService } from '../positions/position-lots.service.js';
import { PositionsService } from '../positions/positions.service.js';
import { INSTRUMENT_SEARCH, type InstrumentSearchProvider } from '../prices/instrument-search.js';
import { SavedScenariosService } from '../scenarios/saved-scenarios.service.js';
import { TaxReturnService } from '../tax-return/tax-return.service.js';
import { McpAuditService } from './mcp-audit.service.js';
import { registerAnalysisTools } from './tools/analysis.js';
import { registerCalculatorTools } from './tools/calculators.js';
import { registerReadTools } from './tools/read.js';
import { ToolRunner, type McpContext } from './tools/tool-runner.js';
import { registerWriteTools } from './tools/write.js';

export type { McpContext } from './tools/tool-runner.js';

/**
 * Builds, per request, the MCP server with Sextante's tools. It is created fresh with the
 * authenticated user's context so the tools close over THEIR `userId` and can never reach
 * anyone else's data. The tools (in `tools/`, one file per group) reuse the existing services
 * (no duplicated business logic) and, for writes, the SAME DTOs as the REST API (no validation
 * drift).
 */
@Injectable()
export class McpService {
  constructor(
    private readonly positions: PositionsService,
    private readonly lots: PositionLotsService,
    private readonly valuation: PortfolioValuationService,
    private readonly snapshots: PortfolioSnapshotsService,
    private readonly scenarios: SavedScenariosService,
    @Inject(INSTRUMENT_SEARCH) private readonly instruments: InstrumentSearchProvider,
    private readonly income: IncomeService,
    private readonly taxReturn: TaxReturnService,
    private readonly audit: McpAuditService,
  ) {}

  createServer(ctx: McpContext): McpServer {
    const server = new McpServer(
      { name: 'sextante', version: '0.1.0' },
      {
        instructions:
          'Sextante is a personal finance and financial independence (FIRE) suite focused on ' +
          'the Spanish tax system, with a portfolio aggregator. It has two kinds of tools. ' +
          '(1) Calculators: pure computation over what you send, with the same engine as the ' +
          'website (IRPF income tax by autonomous community, mortgages, FIRE, Monte Carlo, ' +
          'wealth and gift taxes…); they read no user data. Flow: call `list_calculators` ' +
          '(optionally filtering by `category` or `slug`) to see the slugs and the input schema ' +
          'of each one, then `calculate` with `{ calculator: <slug>, inputs: {...} }`. ' +
          'Percentages are on a base of 100. (2) Portfolio: read, analyse and (with write ' +
          "permission) modify the authenticated user's positions, including the realised " +
          'capital gains by tax year for the Renta (Spanish income tax return), the dividends ' +
          'and interest received (`list_income`), the savings base (base del ahorro) report of ' +
          'a tax year to fill in Renta WEB (`get_tax_return_report`: sales, payments, offsets, ' +
          'tax due and the source of every figure), the breakdown by asset/broker/currency and ' +
          'the progress towards their FIRE goal. The scenarios the user saved in the ' +
          'calculators are in `list_saved_scenarios`. Everything is indicative and does not ' +
          "constitute advice. Each position's amounts are in its native currency; the " +
          '`get_portfolio_valuation` aggregate is converted to the chosen `display` currency. ' +
          'Each position also has its LOTS (dated buys and sells), from which its quantity and ' +
          'average price are derived, and the portfolio has a daily valuation HISTORY in EUR. ' +
          'To add a symbol, look it up first with `search_instruments` instead of guessing the ' +
          'ticker.',
      },
    );

    const runner = new ToolRunner(ctx, this.audit);
    const deps = {
      positions: this.positions,
      lots: this.lots,
      valuation: this.valuation,
      snapshots: this.snapshots,
      scenarios: this.scenarios,
      instruments: this.instruments,
      income: this.income,
      taxReturn: this.taxReturn,
    };
    registerReadTools(server, runner, deps);
    registerAnalysisTools(server, runner, deps);
    registerWriteTools(server, runner, deps);
    registerCalculatorTools(server, runner);
    return server;
  }
}
