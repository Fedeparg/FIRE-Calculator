import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import {
  HISTORY_DEFAULT_DAYS,
  HISTORY_MAX_DAYS,
  type PortfolioSnapshotsService,
} from '../../portfolio/portfolio-snapshots.service.js';
import { incomeQuerySchema } from '../../income/dto/income-query.dto.js';
import type { IncomeService } from '../../income/income.service.js';
import type { PortfolioValuationService } from '../../portfolio/portfolio-valuation.service.js';
import type { PositionLotsService } from '../../positions/position-lots.service.js';
import type { PositionsService } from '../../positions/positions.service.js';
import type { InstrumentSearchProvider } from '../../prices/instrument-search.js';
import { jsonResult } from '../mcp-results.js';
import { CURRENCY_VALUES } from './tool-schemas.js';
import type { ToolRunner } from './tool-runner.js';

export type ReadToolDeps = {
  positions: PositionsService;
  lots: PositionLotsService;
  valuation: PortfolioValuationService;
  snapshots: PortfolioSnapshotsService;
  instruments: InstrumentSearchProvider;
  income: IncomeService;
};

/** Read-only tools (scope `portfolio:read`). */
export function registerReadTools(server: McpServer, runner: ToolRunner, deps: ReadToolDeps): void {
  server.registerTool(
    'list_positions',
    {
      title: 'List portfolio positions',
      description:
        "Returns every position in the authenticated user's portfolio (symbol, name, " +
        'quantity, average price, broker and currency). Read-only.',
      annotations: { readOnlyHint: true },
    },
    () =>
      runner.run('list_positions', async () => {
        const positions = await deps.positions.findAllByUser(runner.userId);
        return jsonResult({ positions });
      }),
  );

  server.registerTool(
    'get_portfolio_valuation',
    {
      title: 'Value the portfolio (market value and P&L)',
      description:
        'Computes the current value and the profit/loss (P&L) of the portfolio with the last ' +
        'known price of each position. Returns the aggregate converted to the `display` ' +
        'currency (positions without a price or in a non-convertible currency are left out of ' +
        'the total and flagged) and the per-position breakdown in its native currency. ' +
        'Derivatives (`isDerivative`) are recorded but Sextante does not track their price: they ' +
        'never count towards the total. Read-only.',
      inputSchema: {
        display: z.enum(CURRENCY_VALUES).optional().describe('Currency of the aggregate total (default EUR).'),
      },
      annotations: { readOnlyHint: true },
    },
    ({ display }) =>
      runner.run('get_portfolio_valuation', async () => {
        const result = await deps.valuation.valuate(runner.userId, display ?? 'EUR');
        return jsonResult(result);
      }),
  );

  server.registerTool(
    'get_position',
    {
      title: 'Position detail and P&L',
      description:
        "Returns a position by its id, with its market value and P&L in the position's " +
        'currency. Get the id from `list_positions` or `get_portfolio_valuation`. Read-only.',
      inputSchema: {
        id: z.string().min(1).describe('Id of the position.'),
      },
      annotations: { readOnlyHint: true },
    },
    ({ id }) =>
      runner.run('get_position', async () => {
        const position = await deps.valuation.valuateOne(runner.userId, id);
        return jsonResult({ position });
      }),
  );

  server.registerTool(
    'search_instruments',
    {
      title: 'Search instruments by name or symbol',
      description:
        'Searches stocks, ETFs, funds and crypto by free text ("bitcoin", "apple", "world ' +
        'etf") and returns the EXACT symbol of each result, with its name, type and market. ' +
        'ALWAYS use it before `add_position` to get the right symbol instead of guessing it: a ' +
        'bare ticker is ambiguous (e.g. "BTC" is a real ETF on NYSE; Bitcoin is "BTC-USD"). ' +
        'Read-only.',
      inputSchema: {
        query: z.string().min(1).max(64).describe('Text to search for (name or symbol).'),
      },
      annotations: { readOnlyHint: true },
    },
    ({ query }) =>
      runner.run('search_instruments', async () => {
        // Same provider as `GET /api/instruments/search`: the LLM and the UI see exactly the
        // same results.
        const results = await deps.instruments.search(query);
        return jsonResult({ results });
      }),
  );

  server.registerTool(
    'get_portfolio_history',
    {
      title: 'Portfolio valuation history',
      description:
        "Returns the daily series of the portfolio's cost and market value (one point per " +
        'day), to analyse its evolution and the return over a period. Amounts are stored in ' +
        'EUR and restated in the `display` currency with the rates of EACH day. The series is ' +
        "rebuilt from the portfolio's first trade (up to 5 years, with the quantity held on " +
        'each day). Points from before the user started recording their portfolio in Sextante ' +
        'are a reconstruction and carry `estimated: true`; from then on points carry ' +
        '`estimated: false` (a daily capture, or the reconstruction of a day the capture missed ' +
        'or that became stale when older trades were recorded). A newly created account has ' +
        'few points. Read-only.',
      inputSchema: {
        days: z
          .number()
          .int()
          .min(1)
          .max(HISTORY_MAX_DAYS)
          .optional()
          .describe(`Look-back window in days (default ${HISTORY_DEFAULT_DAYS}).`),
        display: z.enum(CURRENCY_VALUES).optional().describe('Currency to return the amounts in (default EUR).'),
      },
      annotations: { readOnlyHint: true },
    },
    ({ days, display }) =>
      runner.run('get_portfolio_history', async () => {
        const history = await deps.snapshots.history(runner.userId, days, display);
        return jsonResult(history);
      }),
  );

  server.registerTool(
    'list_position_lots',
    {
      title: 'List the trades (lots) of a position',
      description:
        'Returns the recorded buys and sells of a position, in chronological order, with ' +
        "date, quantity, price and fees. The position's quantity and average price are " +
        'DERIVED from these lots (moving average cost). Get the id from `list_positions`. ' +
        'Read-only.',
      inputSchema: {
        positionId: z.string().min(1).describe('Id of the position.'),
      },
      annotations: { readOnlyHint: true },
    },
    ({ positionId }) =>
      runner.run('list_position_lots', async () => {
        const lots = await deps.lots.listByPosition(runner.userId, positionId);
        return jsonResult({ lots });
      }),
  );

  server.registerTool(
    'list_income',
    {
      title: 'List dividends, interest and rewards',
      description:
        "Returns the user's payments taxed as investment income (rendimientos del capital " +
        'mobiliario): dividends (`dividend`), interest (`interest`) and broker rewards such as ' +
        'saveback (`benefit`, declared as interest). Each payment carries the gross amount, the ' +
        'withholding tax at source (`withholdingOrigin`, null if unknown) and the Spanish one, ' +
        'in its currency, and `reportedToAeat`: whether the payer already reported it to the ' +
        'Spanish tax agency (AEAT), so it may appear in the draft return (borrador). Filter by ' +
        'tax year (`year`) or position. Read-only.',
      inputSchema: incomeQuerySchema.shape,
      annotations: { readOnlyHint: true },
    },
    (query) =>
      runner.run('list_income', async () => {
        const income = await deps.income.list(runner.userId, query);
        return jsonResult({ income });
      }),
  );
}
