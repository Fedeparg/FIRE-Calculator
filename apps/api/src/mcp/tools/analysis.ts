import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { FIRE_SEARCH_MAX_YEARS } from '@sextante/core/calculators/fire';
import { MAX_RETIREMENT_YEARS, MAX_VOLATILITY } from '@sextante/core/calculators/fire-montecarlo';
import {
  computeGoalProgress,
  resolveGoalTarget,
  simulatePortfolioGoal,
  type GoalTargetError,
} from '@sextante/core/portfolio/goal';
import { z } from 'zod';

import { fiscalYearSchema } from '../../common/dto/fiscal-year.js';
import type { PortfolioValuationService } from '../../portfolio/portfolio-valuation.service.js';
import type { SavedScenariosService } from '../../scenarios/saved-scenarios.service.js';
import type { TaxReturnService } from '../../tax-return/tax-return.service.js';
import { jsonResult } from '../mcp-results.js';
import { InvalidToolInputError } from '../tool-errors.js';
import { BREAKDOWN_VALUES, CURRENCY_VALUES, FREQUENCY_VALUES } from './tool-schemas.js';
import type { ToolRunner } from './tool-runner.js';

export type AnalysisToolDeps = {
  valuation: PortfolioValuationService;
  scenarios: SavedScenariosService;
  taxReturn: TaxReturnService;
};

/** Message sent to the MCP client for each `resolveGoalTarget` error. */
const GOAL_TARGET_ERRORS: Record<GoalTargetError, string> = {
  amountIncomplete: 'amount mode needs targetAmount and targetYears',
  mixedModes: 'use annualExpenses/withdrawalRate (FIRE mode) or targetAmount/targetYears (amount mode), not both',
  fireIncomplete: 'FIRE mode needs annualExpenses and withdrawalRate',
};

/**
 * Portfolio analysis tools (scope `portfolio:read`): what the web app computes over the user's
 * data, with the same `@sextante/core` functions.
 */
export function registerAnalysisTools(server: McpServer, runner: ToolRunner, deps: AnalysisToolDeps): void {
  server.registerTool(
    'get_realised_gains',
    {
      title: 'Realised capital gains by tax year (for the Renta tax return)',
      description:
        'Capital gains and losses (ganancias y pérdidas patrimoniales) of the recorded sales, ' +
        'computed by FIFO as Spanish law requires and grouped by tax year (ejercicio), in euros: ' +
        'transfer value (valor de transmisión), acquisition value (valor de adquisición, fees ' +
        'included) and the result of each sale, plus an estimate of the tax due on the savings ' +
        'base (base del ahorro). Sales in another currency are computed in that currency and ' +
        'converted to euros at the ECB reference rate on the sale date (DGT ruling V0152-26); ' +
        'the exchange difference on the invested currency is reported separately ' +
        '(`fxDifference`), assuming the broker converts to euros on buying and on selling. ' +
        'Sales without a published rate go in `unconverted`, outside the totals; if ' +
        '`ratesLoaded` is false, the ECB rates could not be loaded and every foreign-currency ' +
        'sale stays unconverted: warn the user. Use it to prepare the capital gains boxes ' +
        '(casillas). Applies the two-month rule (art. 33.5.f LIRPF): the loss on a sale with a ' +
        'homogeneous repurchase within the window is deferred (`deferredLoss`) and included ' +
        'when that repurchase is sold (`integratedLoss`). It offsets sales within the same tax ' +
        'year, but does NOT apply the negative balances of the previous four tax years nor the ' +
        '25% offset against dividends and interest (for that, use `get_tax_return_report`). ' +
        'Read-only.',
      inputSchema: {
        year: fiscalYearSchema
          .optional()
          .describe('Tax year (ejercicio). Without a value, returns every tax year with sales.'),
      },
      annotations: { readOnlyHint: true },
    },
    ({ year }) =>
      runner.run('get_realised_gains', async () =>
        // Same computation as `get_tax_return_report` and the REST API (`TaxReturnService`).
        jsonResult(await deps.taxReturn.realisedGains(runner.userId, year)),
      ),
  );

  server.registerTool(
    'get_tax_return_report',
    {
      title: 'Savings base of a tax year (to fill in Renta WEB)',
      description:
        'Report on the savings base (base del ahorro) of a tax year to help fill in Renta WEB ' +
        '(the Spanish online tax return), built with the same functions as the website. ' +
        'Blocks: `gains` = sales of securities (FIFO, in euros, with the transfer value, ' +
        'acquisition value and result of each sale in `sales`, plus the exchange difference ' +
        '`fxDifference`); `income` = interest and dividends received (investment income, ' +
        'rendimientos del capital mobiliario, with withholding tax at source and in Spain and ' +
        'the part already in the AEAT draft return, borrador); `incomeEvents` = each payment; ' +
        '`savings` = the savings base: net capital gains and losses, investment income, offset ' +
        'of negative balances from previous years (including the pending ones the user entered ' +
        'by hand), tax due (cuota), international double taxation relief and Spanish ' +
        'withholdings (`result` = tax due − withholdings). `availableYears` lists the tax years ' +
        'with data; `null` in a block means that tax year has no data of that kind. The figures ' +
        'are indicative, not advice, and do not replace the AEAT draft return: check them ' +
        'against it. Every figure carries its source: in payments, `grossSource` and ' +
        '`withholdingOriginSource` are `broker` (broker data), `derived` (computed from broker ' +
        "data), `market` (market data), `estimate` (an estimate, e.g. the country's statutory " +
        "withholding rate: check it against the payer's certificate) or `manual` (entered by " +
        'the user); in sales, `eur` gives the ECB rate (and its date) applied to the sale and ' +
        'to each purchase. If `incomplete` is true or `ratesLoaded` is false, the figure is ' +
        'incomplete (sales or payments without an exchange rate, or an unknown withholding at ' +
        'source) and you must warn the user. Read-only.',
      inputSchema: {
        year: fiscalYearSchema
          .optional()
          .describe('Tax year (ejercicio). Without a value, the latest tax year with sales or payments.'),
      },
      annotations: { readOnlyHint: true },
    },
    ({ year }) =>
      runner.run('get_tax_return_report', async () => jsonResult(await deps.taxReturn.build(runner.userId, year))),
  );

  server.registerTool(
    'get_portfolio_breakdown',
    {
      title: 'Portfolio breakdown',
      description:
        "Splits the portfolio's current market value by asset, broker or currency and " +
        'returns the weight of each group in %, converted to the `display` currency. Positions ' +
        'without a price or in a non-convertible currency are left out and counted; ' +
        'derivatives are not included. Read-only.',
      inputSchema: {
        groupBy: z.enum(BREAKDOWN_VALUES).describe('Grouping: asset (by security), broker or currency.'),
        display: z.enum(CURRENCY_VALUES).optional().describe('Currency of the breakdown (default EUR).'),
      },
      annotations: { readOnlyHint: true },
    },
    ({ groupBy, display }) =>
      runner.run('get_portfolio_breakdown', async () =>
        jsonResult(await deps.valuation.breakdown(runner.userId, display ?? 'EUR', groupBy)),
      ),
  );

  server.registerTool(
    'get_fire_goal_progress',
    {
      title: 'Portfolio progress towards the FIRE goal',
      description:
        "Measures the user's REAL portfolio (its current market value) against a goal, in " +
        'one of two modes. FIRE (`annualExpenses` + `withdrawalRate`): target wealth = annual ' +
        'spending / withdrawal rate; with `volatility` and `retirementYears` it adds the Monte ' +
        'Carlo probability of reaching it and of the money lasting. Amount (`targetAmount` + ' +
        '`targetYears`): gather a sum within a term, with the contribution needed per period ' +
        'and whether the current pace gets there. Both return the % achieved, what is missing ' +
        'and the estimated years with the given contribution and return. If the user saved a ' +
        'FIRE calculator scenario (slug independencia-financiera in `list_saved_scenarios`), ' +
        'use its values: `goalMode: "amount"` means amount mode. Amounts are in the `display` ' +
        'currency. Read-only.',
      inputSchema: {
        annualExpenses: z.number().min(0).max(1e12).optional().describe('FIRE mode: desired annual spending.'),
        withdrawalRate: z.number().min(0).max(100).optional().describe('FIRE mode: withdrawal rate (typically 4).'),
        targetAmount: z
          .number()
          .min(0)
          .max(1e12)
          .optional()
          .describe('Amount mode: sum to gather. Excludes annualExpenses/withdrawalRate.'),
        targetYears: z
          .number()
          .int()
          .min(0)
          .max(FIRE_SEARCH_MAX_YEARS)
          .optional()
          .describe('Amount mode: term in whole years.'),
        contribution: z.number().min(0).max(1e12).describe('Contribution per period.'),
        frequency: z.enum(FREQUENCY_VALUES).optional().describe('Contribution frequency (default monthly).'),
        annualReturn: z.number().min(-99).max(100).describe('Expected REAL annual return, on a base of 100.'),
        volatility: z
          .number()
          .min(0)
          .max(MAX_VOLATILITY)
          .optional()
          .describe('Annual volatility on a base of 100, for the Monte Carlo simulation.'),
        retirementYears: z
          .number()
          .min(0)
          .max(MAX_RETIREMENT_YEARS)
          .optional()
          .describe('Years the money must last, for the Monte Carlo simulation.'),
        display: z.enum(CURRENCY_VALUES).optional().describe('Currency of the goal and the portfolio (default EUR).'),
      },
      annotations: { readOnlyHint: true },
    },
    ({
      volatility,
      retirementYears,
      display,
      frequency,
      annualExpenses,
      withdrawalRate,
      targetAmount,
      targetYears,
      contribution,
      annualReturn,
    }) =>
      runner.run('get_fire_goal_progress', async () => {
        const resolved = resolveGoalTarget({ annualExpenses, withdrawalRate, targetAmount, targetYears });
        if ('error' in resolved) {
          throw new InvalidToolInputError(GOAL_TARGET_ERRORS[resolved.error]);
        }
        const currency = display ?? 'EUR';
        const { aggregate } = await deps.valuation.valuate(runner.userId, currency);
        const progress = {
          contribution,
          annualReturn,
          frequency: frequency ?? 'monthly',
          currentValue: aggregate.marketValue,
        } as const;
        const outcome = computeGoalProgress(resolved.target, progress);
        const header = {
          display: currency,
          // How many positions count towards the current value: those without a price do not.
          valuedPositions: aggregate.valued,
          totalPositions: aggregate.total,
        };
        const simulation =
          resolved.target.mode === 'fire' && volatility !== undefined && retirementYears !== undefined
            ? simulatePortfolioGoal({ ...progress, ...resolved.target, volatility, retirementYears })
            : undefined;
        // `mode` goes first on purpose: it is the key order the client sees.
        const { mode, ...result } = outcome;
        return jsonResult({ mode, ...header, ...result, ...(simulation ? { simulation } : {}) });
      }),
  );

  server.registerTool(
    'list_saved_scenarios',
    {
      title: 'Saved calculator scenarios',
      description:
        'Returns the scenarios the user saved in the website calculators (name, calculator by ' +
        'its slug and the values entered), to reuse them with `calculate` or ' +
        '`get_fire_goal_progress`. Read-only.',
      inputSchema: {
        slug: z.string().max(64).optional().describe('Only those of one calculator (e.g. independencia-financiera).'),
      },
      annotations: { readOnlyHint: true },
    },
    ({ slug }) =>
      runner.run('list_saved_scenarios', async () => {
        const scenarios = await deps.scenarios.findAllByUser(runner.userId, slug);
        return jsonResult({ scenarios });
      }),
  );
}
