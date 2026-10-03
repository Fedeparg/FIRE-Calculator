import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { createIncomeSchema, incomeFieldsSchema } from '../../income/dto/create-income.dto.js';
import { updateIncomeSchema } from '../../income/dto/update-income.dto.js';
import type { IncomeService } from '../../income/income.service.js';
import { combinePositionSchema } from '../../positions/dto/combine-position.dto.js';
import { createPositionSchema } from '../../positions/dto/create-position.dto.js';
import { createPositionLotSchema } from '../../positions/dto/create-position-lot.dto.js';
import { updatePositionSchema } from '../../positions/dto/update-position.dto.js';
import type { PositionLotsService } from '../../positions/position-lots.service.js';
import type { PositionsService } from '../../positions/positions.service.js';
import { jsonResult } from '../mcp-results.js';
import { InvalidToolInputError } from '../tool-errors.js';
import type { ToolRunner } from './tool-runner.js';

export type WriteToolDeps = {
  positions: PositionsService;
  lots: PositionLotsService;
  income: IncomeService;
};

/**
 * Write tools (scope `portfolio:write`). They are always registered (so the host discovers them),
 * but each one checks the scope at run time: a read-only token gets a tool error asking it to
 * reconnect with write permission (step-up). It is not an HTTP 403: all tools share the same
 * endpoint, so the check is per tool.
 *
 * Each tool's `inputSchema` comes from the DTOs' zod schemas (the same ones that validate the REST
 * API). But the SDK only accepts a `shape`, which drops the cross-field refinements ("at least one
 * field", "withholdings do not exceed the gross amount"…): so each tool re-validates with the FULL
 * REST schema (`asRest`) before calling the service. That way the MCP path is not a weaker way to
 * write.
 */
/** Validates like the REST API (full schema, refinements included); a failure is a tool input error. */
function asRest<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new InvalidToolInputError(
      result.error.issues.map((issue) => `${issue.path.join('.') || 'input'}: ${issue.message}`).join('; '),
    );
  }
  return result.data;
}

export function registerWriteTools(server: McpServer, runner: ToolRunner, deps: WriteToolDeps): void {
  server.registerTool(
    'add_position',
    {
      title: 'Add a position',
      description:
        'Creates a new position in the portfolio. If the same symbol already exists, give the ' +
        'broker to tell them apart; if the exact (symbol, broker) pair already exists, use ' +
        '`combine_position` instead. Requires write permission.',
      inputSchema: createPositionSchema.shape,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    (args) =>
      runner.runWrite('add_position', async () => {
        const position = await deps.positions.create(runner.userId, asRest(createPositionSchema, args));
        return jsonResult({ position });
      }),
  );

  server.registerTool(
    'update_position',
    {
      title: 'Edit a position',
      description:
        'Updates the given fields of an existing position (by id). Only the fields sent are ' +
        'changed. Requires write permission.',
      inputSchema: {
        id: z.string().min(1).describe('Id of the position to edit.'),
        ...updatePositionSchema.shape,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    ({ id, ...rest }) =>
      runner.runWrite('update_position', async () => {
        const position = await deps.positions.update(runner.userId, id, asRest(updatePositionSchema, rest));
        return jsonResult({ position });
      }),
  );

  server.registerTool(
    'combine_position',
    {
      title: 'Merge a purchase into an existing position',
      description:
        'Merges a new purchase into an existing position (by id) using the weighted average of ' +
        "quantity and price. The currency must match the position's. Requires write " +
        'permission.',
      inputSchema: {
        id: z.string().min(1).describe('Id of the existing position.'),
        ...combinePositionSchema.shape,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    ({ id, ...rest }) =>
      runner.runWrite('combine_position', async () => {
        const position = await deps.positions.combine(runner.userId, id, asRest(combinePositionSchema, rest));
        return jsonResult({ position });
      }),
  );

  server.registerTool(
    'delete_position',
    {
      title: 'Delete a position',
      description: 'Deletes a position from the portfolio (by id). This cannot be undone. Requires write permission.',
      inputSchema: {
        id: z.string().min(1).describe('Id of the position to delete.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    ({ id }) =>
      runner.runWrite('delete_position', async () => {
        await deps.positions.remove(runner.userId, id);
        return jsonResult({ deleted: true, id });
      }),
  );

  server.registerTool(
    'add_position_lot',
    {
      title: 'Record a buy or sell on a position',
      description:
        'Adds a trade with its DATE to an existing position and recalculates its quantity and ' +
        'average price (buys and sells; the average price follows the moving average cost, so ' +
        'a sell lowers the quantity but does not move it). Prefer this tool to ' +
        '`combine_position` when you know the trade date, and use it to record sells: it is ' +
        'what builds the history. A sell larger than the holding is rejected. Requires write ' +
        'permission.',
      inputSchema: {
        positionId: z.string().min(1).describe('Id of the position.'),
        ...createPositionLotSchema.shape,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    ({ positionId, ...rest }) =>
      runner.runWrite('add_position_lot', async () => {
        const lot = await deps.lots.create(runner.userId, positionId, asRest(createPositionLotSchema, rest));
        return jsonResult({ lot });
      }),
  );

  server.registerTool(
    'delete_position_lot',
    {
      title: 'Delete a trade (lot) from a position',
      description:
        "Deletes a recorded trade and recalculates the position's quantity and average price " +
        'from the remaining ones. This cannot be undone: it fixes recording mistakes and is not ' +
        'the way to record a sell (for that, `add_position_lot` with kind "sell"). Requires ' +
        'write permission.',
      inputSchema: {
        positionId: z.string().min(1).describe('Id of the position.'),
        lotId: z.string().min(1).describe('Id of the lot to delete.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    ({ positionId, lotId }) =>
      runner.runWrite('delete_position_lot', async () => {
        await deps.lots.remove(runner.userId, positionId, lotId);
        return jsonResult({ deleted: true, lotId });
      }),
  );

  server.registerTool(
    'add_income',
    {
      title: 'Record a dividend, interest or reward',
      description:
        'Adds a payment taxed as investment income (rendimiento del capital mobiliario), with ' +
        'its payment date, the gross amount and the withholding taxes (at source and in Spain). ' +
        'For a foreign dividend, give `country` and the withholding at source: they are needed ' +
        'for the double taxation relief (deducción por doble imposición). Requires write ' +
        'permission.',
      inputSchema: incomeFieldsSchema.shape,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    (args) =>
      runner.runWrite('add_income', async () => {
        const income = await deps.income.create(runner.userId, asRest(createIncomeSchema, args));
        return jsonResult({ income });
      }),
  );

  server.registerTool(
    'update_income',
    {
      title: 'Edit a payment',
      description:
        'Updates the given fields of a payment (by id); only the fields sent change. ' + 'Requires write permission.',
      inputSchema: {
        id: z.string().min(1).describe('Id of the payment.'),
        ...incomeFieldsSchema.partial().shape,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    ({ id, ...rest }) =>
      runner.runWrite('update_income', async () => {
        const income = await deps.income.update(runner.userId, id, asRest(updateIncomeSchema, rest));
        return jsonResult({ income });
      }),
  );

  server.registerTool(
    'delete_income',
    {
      title: 'Delete a payment',
      description: 'Deletes a payment (by id). This cannot be undone. Requires write permission.',
      inputSchema: {
        id: z.string().min(1).describe('Id of the payment to delete.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    ({ id }) =>
      runner.runWrite('delete_income', async () => {
        await deps.income.remove(runner.userId, id);
        return jsonResult({ deleted: true, id });
      }),
  );
}
