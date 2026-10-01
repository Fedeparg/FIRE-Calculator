import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { z } from 'zod';

import { CombinePositionDto } from '../../positions/dto/combine-position.dto.js';
import { CreatePositionDto } from '../../positions/dto/create-position.dto.js';
import { CreatePositionLotDto } from '../../positions/dto/create-position-lot.dto.js';
import { UpdatePositionDto } from '../../positions/dto/update-position.dto.js';
import { PositionLotsService } from '../../positions/position-lots.service.js';
import { PositionsService } from '../../positions/positions.service.js';
import { jsonResult } from '../mcp-results.js';
import { CURRENCY_VALUES } from './tool-schemas.js';
import { InvalidToolInputError, type ToolRunner } from './tool-runner.js';

export type WriteToolDeps = {
  positions: PositionsService;
  lots: PositionLotsService;
};

/**
 * Valida la entrada de una tool de escritura con el mismo DTO (class-validator) que usa la
 * API REST, de modo que el camino MCP no sea una vía de escritura más débil (divisa fuera de
 * la lista, cantidades negativas, etc.). Lanza con los mensajes de validación si falla.
 */
async function validateDto<T extends object>(cls: new () => T, input: unknown): Promise<T> {
  const dto = plainToInstance(cls, input);
  const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  if (errors.length > 0) {
    const messages = errors.flatMap((e) => Object.values(e.constraints ?? {})).join('; ');
    throw new InvalidToolInputError(messages || 'Entrada no válida');
  }
  return dto;
}

/**
 * Tools de escritura (scope `portfolio:write`). Se registran siempre (para que el host las
 * descubra), pero cada una verifica el scope en tiempo de ejecución: un token solo-lectura
 * recibe un error de tool pidiendo reconectar con permiso de escritura (step-up). No es un
 * 403 HTTP: todas las tools comparten el mismo endpoint, así que el control es por-tool.
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
      inputSchema: {
        ticker: z.string().min(1).max(20).describe('Símbolo (p. ej. "IWDA", "AAPL").'),
        name: z.string().max(100).optional().describe('Nombre legible (opcional).'),
        quantity: z.number().positive().describe('Número de participaciones/acciones.'),
        avgPrice: z.number().min(0).describe('Precio medio de compra.'),
        broker: z.string().max(100).optional().describe('Bróker (opcional).'),
        currency: z.enum(CURRENCY_VALUES).optional().describe('Divisa (por defecto EUR).'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    (args) =>
      runner.runWrite('add_position', async () => {
        const dto = await validateDto(CreatePositionDto, args);
        const position = await deps.positions.create(runner.userId, dto);
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
        ticker: z.string().min(1).max(20).optional(),
        name: z.string().max(100).optional(),
        quantity: z.number().positive().optional(),
        avgPrice: z.number().min(0).optional(),
        broker: z.string().max(100).optional(),
        currency: z.enum(CURRENCY_VALUES).optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    ({ id, ...rest }) =>
      runner.runWrite('update_position', async () => {
        const dto = await validateDto(UpdatePositionDto, rest);
        const position = await deps.positions.update(runner.userId, id, dto);
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
        quantity: z.number().positive().describe('Cantidad de la nueva compra.'),
        avgPrice: z.number().min(0).describe('Precio de la nueva compra.'),
        currency: z.enum(CURRENCY_VALUES).optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    ({ id, ...rest }) =>
      runner.runWrite('combine_position', async () => {
        const dto = await validateDto(CombinePositionDto, rest);
        const position = await deps.positions.combine(runner.userId, id, dto);
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
        kind: z.enum(['buy', 'sell']).describe('Tipo de operación: compra o venta.'),
        quantity: z.number().positive().describe('Cantidad operada.'),
        price: z.number().min(0).describe('Precio unitario de la operación.'),
        fees: z.number().min(0).optional().describe('Comisiones (opcional).'),
        tradedAt: z.string().describe('Fecha de la operación en formato YYYY-MM-DD.'),
        note: z.string().max(200).optional().describe('Nota libre (opcional).'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    ({ positionId, ...rest }) =>
      runner.runWrite('add_position_lot', async () => {
        const dto = await validateDto(CreatePositionLotDto, rest);
        const lot = await deps.lots.create(runner.userId, positionId, dto);
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
}
