import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { incomeFieldsSchema } from '../../income/dto/create-income.dto.js';
import { IncomeService } from '../../income/income.service.js';
import { combinePositionSchema } from '../../positions/dto/combine-position.dto.js';
import { createPositionSchema } from '../../positions/dto/create-position.dto.js';
import { createPositionLotSchema } from '../../positions/dto/create-position-lot.dto.js';
import { updatePositionSchema } from '../../positions/dto/update-position.dto.js';
import { PositionLotsService } from '../../positions/position-lots.service.js';
import { PositionsService } from '../../positions/positions.service.js';
import { jsonResult } from '../mcp-results.js';
import type { ToolRunner } from './tool-runner.js';

export type WriteToolDeps = {
  positions: PositionsService;
  lots: PositionLotsService;
  income: IncomeService;
};

/**
 * Tools de escritura (scope `portfolio:write`). Se registran siempre (para que el host las
 * descubra), pero cada una verifica el scope en tiempo de ejecución: un token solo-lectura
 * recibe un error de tool pidiendo reconectar con permiso de escritura (step-up). No es un
 * 403 HTTP: todas las tools comparten el mismo endpoint, así que el control es por-tool.
 *
 * El `inputSchema` de cada tool sale de los esquemas zod de `positions/dto` (los mismos que validan
 * la API REST): así el camino MCP no es una vía de escritura más débil y no puede divergir de ella.
 */
export function registerWriteTools(server: McpServer, runner: ToolRunner, deps: WriteToolDeps): void {
  server.registerTool(
    'add_position',
    {
      title: 'Añadir una posición',
      description:
        'Crea una nueva posición en la cartera. Si ya existe el mismo símbolo, indica el ' +
        'bróker para distinguirla; si el (símbolo, bróker) exacto ya existe, usa ' +
        '`combine_position` en su lugar. Requiere permiso de escritura.',
      inputSchema: createPositionSchema.shape,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    (args) =>
      runner.runWrite('add_position', async () => {
        const position = await deps.positions.create(runner.userId, args);
        return jsonResult({ position });
      }),
  );

  server.registerTool(
    'update_position',
    {
      title: 'Editar una posición',
      description:
        'Actualiza los campos indicados de una posición existente (por id). Solo se cambian ' +
        'los campos enviados. Requiere permiso de escritura.',
      inputSchema: {
        id: z.string().min(1).describe('Id de la posición a editar.'),
        ...updatePositionSchema.shape,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    ({ id, ...rest }) =>
      runner.runWrite('update_position', async () => {
        const position = await deps.positions.update(runner.userId, id, rest);
        return jsonResult({ position });
      }),
  );

  server.registerTool(
    'combine_position',
    {
      title: 'Combinar una compra con una posición existente',
      description:
        'Fusiona una nueva compra con una posición existente (por id) mediante media ' +
        'ponderada de cantidad y precio. La divisa debe coincidir con la de la posición. ' +
        'Requiere permiso de escritura.',
      inputSchema: {
        id: z.string().min(1).describe('Id de la posición existente.'),
        ...combinePositionSchema.shape,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    ({ id, ...rest }) =>
      runner.runWrite('combine_position', async () => {
        const position = await deps.positions.combine(runner.userId, id, rest);
        return jsonResult({ position });
      }),
  );

  server.registerTool(
    'delete_position',
    {
      title: 'Borrar una posición',
      description:
        'Elimina una posición de la cartera (por id). Acción irreversible. Requiere permiso ' + 'de escritura.',
      inputSchema: {
        id: z.string().min(1).describe('Id de la posición a borrar.'),
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
      title: 'Registrar una compra o venta en una posición',
      description:
        'Añade una operación con su FECHA a una posición existente y recalcula su cantidad ' +
        'y precio medio (compras y ventas; el precio medio sigue el coste medio móvil, así ' +
        'que una venta baja la cantidad pero no lo mueve). Prefiere esta tool a ' +
        '`combine_position` cuando conozcas la fecha de la operación, y úsala para ' +
        'registrar ventas: es lo que construye el histórico. Una venta mayor que lo que se ' +
        'tiene se rechaza. Requiere permiso de escritura.',
      inputSchema: {
        positionId: z.string().min(1).describe('Id de la posición.'),
        ...createPositionLotSchema.shape,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    ({ positionId, ...rest }) =>
      runner.runWrite('add_position_lot', async () => {
        const lot = await deps.lots.create(runner.userId, positionId, rest);
        return jsonResult({ lot });
      }),
  );

  server.registerTool(
    'delete_position_lot',
    {
      title: 'Borrar una operación (lote) de una posición',
      description:
        'Elimina una operación registrada y recalcula la cantidad y el precio medio de la ' +
        'posición con las que queden. Acción irreversible: corrige errores de registro, no ' +
        'sirve para reflejar una venta (para eso, `add_position_lot` con kind "sell"). ' +
        'Requiere permiso de escritura.',
      inputSchema: {
        positionId: z.string().min(1).describe('Id de la posición.'),
        lotId: z.string().min(1).describe('Id del lote a borrar.'),
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
      title: 'Registrar un dividendo, interés o recompensa',
      description:
        'Añade un cobro que tributa como rendimiento del capital mobiliario, con su fecha de ' +
        'cobro, el íntegro y las retenciones (en origen y en España). Para un dividendo ' +
        'extranjero indica `country` y la retención en origen: hacen falta para la deducción ' +
        'por doble imposición. Requiere permiso de escritura.',
      inputSchema: incomeFieldsSchema.shape,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    (args) =>
      runner.runWrite('add_income', async () => {
        const income = await deps.income.create(runner.userId, args);
        return jsonResult({ income });
      }),
  );

  server.registerTool(
    'update_income',
    {
      title: 'Editar un cobro',
      description:
        'Actualiza los campos indicados de un cobro (por id); solo cambian los enviados. ' +
        'Requiere permiso de escritura.',
      inputSchema: {
        id: z.string().min(1).describe('Id del cobro.'),
        ...incomeFieldsSchema.partial().shape,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    ({ id, ...rest }) =>
      runner.runWrite('update_income', async () => {
        const income = await deps.income.update(runner.userId, id, rest);
        return jsonResult({ income });
      }),
  );

  server.registerTool(
    'delete_income',
    {
      title: 'Borrar un cobro',
      description: 'Elimina un cobro (por id). Acción irreversible. Requiere permiso de escritura.',
      inputSchema: {
        id: z.string().min(1).describe('Id del cobro a borrar.'),
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
