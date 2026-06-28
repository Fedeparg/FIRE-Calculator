import { Injectable } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { z } from 'zod';

import { SCOPE_PORTFOLIO_WRITE } from '../oauth/oauth.constants';
import { PortfolioValuationService } from '../portfolio/portfolio-valuation.service';
import { SUPPORTED_CURRENCIES } from '../positions/dto/create-position.dto';
import { CombinePositionDto } from '../positions/dto/combine-position.dto';
import { CreatePositionDto } from '../positions/dto/create-position.dto';
import { UpdatePositionDto } from '../positions/dto/update-position.dto';
import { PositionsService } from '../positions/positions.service';
import { McpAuditService } from './mcp-audit.service';

/**
 * Contexto de seguridad de una petición MCP, derivado del access token verificado. El
 * `userId` es lo que hace que toda tool devuelva SOLO los datos de su dueño (mismo principio
 * de aislamiento que `positions` con el JWT). Ver `_local/mcp-integracion.md`.
 */
export type McpContext = {
  userId: string;
  clientId: string;
  scopes: string[];
};

/** Lista de divisas como tupla mutable para `z.enum` (SUPPORTED_CURRENCIES es `as const`). */
const CURRENCY_VALUES = [...SUPPORTED_CURRENCIES] as [string, ...string[]];

/** Empaqueta un objeto como resultado de tool MCP (texto JSON legible). */
function jsonResult(value: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

/** Resultado de tool marcado como error (el host lo muestra al usuario sin romper la sesión). */
function errorResult(message: string): CallToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

/**
 * Construye, por petición, el servidor MCP con las tools de Sextante. Se crea fresco con el
 * contexto del usuario autenticado para que las tools cierren sobre SU `userId` y nunca
 * puedan acceder a datos de otro. Las tools reutilizan los servicios existentes (sin duplicar
 * lógica de negocio) y, en escritura, los MISMOS DTOs que la API REST (sin drift de validación).
 */
@Injectable()
export class McpService {
  constructor(
    private readonly positions: PositionsService,
    private readonly valuation: PortfolioValuationService,
    private readonly audit: McpAuditService,
  ) {}

  createServer(ctx: McpContext): McpServer {
    const server = new McpServer(
      { name: 'sextante', version: '0.1.0' },
      {
        instructions:
          'Sextante es un agregador de cartera enfocado al mercado español. Usa estas ' +
          'herramientas para leer, analizar y (con permiso de escritura) modificar las ' +
          'posiciones del usuario autenticado. Los importes de cada posición están en su ' +
          'divisa nativa; el agregado de `get_portfolio_valuation` se convierte a la divisa ' +
          '`display` elegida.',
      },
    );

    this.registerReadTools(server, ctx);
    this.registerWriteTools(server, ctx);
    return server;
  }

  /** Tools de solo lectura (scope `portfolio:read`). */
  private registerReadTools(server: McpServer, ctx: McpContext): void {
    server.registerTool(
      'list_positions',
      {
        title: 'Listar posiciones de la cartera',
        description:
          'Devuelve todas las posiciones de la cartera del usuario autenticado (símbolo, ' +
          'nombre, cantidad, precio medio, bróker y divisa). Solo lectura.',
        annotations: { readOnlyHint: true },
      },
      () =>
        this.run(ctx, 'list_positions', async () => {
          const positions = await this.positions.findAllByUser(ctx.userId);
          return jsonResult({ positions });
        }),
    );

    server.registerTool(
      'get_portfolio_valuation',
      {
        title: 'Valorar la cartera (valor de mercado y P&L)',
        description:
          'Calcula el valor actual y la ganancia/pérdida (P&L) de la cartera con el último ' +
          'precio conocido de cada posición. Devuelve el agregado convertido a la divisa ' +
          '`display` (las posiciones sin precio o en divisa no convertible se excluyen del ' +
          'total y se señalan) y el desglose por posición en su divisa nativa. Solo lectura.',
        inputSchema: {
          display: z
            .enum(CURRENCY_VALUES)
            .optional()
            .describe('Divisa del total agregado (por defecto EUR).'),
        },
        annotations: { readOnlyHint: true },
      },
      ({ display }) =>
        this.run(ctx, 'get_portfolio_valuation', async () => {
          const result = await this.valuation.valuate(ctx.userId, display ?? 'EUR');
          return jsonResult(result);
        }),
    );

    server.registerTool(
      'get_position',
      {
        title: 'Detalle y P&L de una posición',
        description:
          'Devuelve una posición por su id, con su valor de mercado y P&L en la divisa de la ' +
          'posición. El id se obtiene de `list_positions` o `get_portfolio_valuation`. Solo lectura.',
        inputSchema: {
          id: z.string().min(1).describe('Id de la posición.'),
        },
        annotations: { readOnlyHint: true },
      },
      ({ id }) =>
        this.run(ctx, 'get_position', async () => {
          const position = await this.valuation.valuateOne(ctx.userId, id);
          return jsonResult({ position });
        }),
    );
  }

  /**
   * Tools de escritura (scope `portfolio:write`). Se registran SIEMPRE (para que el host las
   * descubra), pero cada una verifica el scope en tiempo de ejecución: un token solo-lectura
   * recibe un error de tool pidiendo reconectar con permiso de escritura (step-up). No es un
   * 403 HTTP: todas las tools comparten el mismo endpoint, así que el control es por-tool.
   */
  private registerWriteTools(server: McpServer, ctx: McpContext): void {
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
        this.runWrite(ctx, 'add_position', async () => {
          const dto = await this.validateDto(CreatePositionDto, args);
          const position = await this.positions.create(ctx.userId, dto);
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
        this.runWrite(ctx, 'update_position', async () => {
          const dto = await this.validateDto(UpdatePositionDto, rest);
          const position = await this.positions.update(ctx.userId, id, dto);
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
        this.runWrite(ctx, 'combine_position', async () => {
          const dto = await this.validateDto(CombinePositionDto, rest);
          const position = await this.positions.combine(ctx.userId, id, dto);
          return jsonResult({ position });
        }),
    );

    server.registerTool(
      'delete_position',
      {
        title: 'Borrar una posición',
        description:
          'Elimina una posición de la cartera (por id). Acción irreversible. Requiere permiso ' +
          'de escritura.',
        inputSchema: {
          id: z.string().min(1).describe('Id de la posición a borrar.'),
        },
        annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
      },
      ({ id }) =>
        this.runWrite(ctx, 'delete_position', async () => {
          await this.positions.remove(ctx.userId, id);
          return jsonResult({ deleted: true, id });
        }),
    );
  }

  /**
   * Ejecuta el cuerpo de una tool de LECTURA con auditoría. Los errores de dominio se
   * traducen a resultado de error de tool (no a un 500): el host los muestra al usuario.
   */
  private async run(
    ctx: McpContext,
    tool: string,
    body: () => Promise<CallToolResult>,
  ): Promise<CallToolResult> {
    try {
      const result = await body();
      await this.audit.record(ctx.userId, ctx.clientId, tool, 'ok');
      return result;
    } catch (error) {
      await this.audit.record(ctx.userId, ctx.clientId, tool, 'error');
      return errorResult(toUserMessage(error));
    }
  }

  /**
   * Igual que `run` pero exige el scope de escritura ANTES de ejecutar (step-up por-tool). Un
   * token sin `portfolio:write` recibe un error claro y queda registrado como `denied_scope`.
   */
  private async runWrite(
    ctx: McpContext,
    tool: string,
    body: () => Promise<CallToolResult>,
  ): Promise<CallToolResult> {
    if (!ctx.scopes.includes(SCOPE_PORTFOLIO_WRITE)) {
      await this.audit.record(ctx.userId, ctx.clientId, tool, 'denied_scope');
      return errorResult(
        'Esta acción requiere permiso de escritura (portfolio:write). Vuelve a conectar la ' +
          'aplicación concediendo acceso de escritura para poder modificar la cartera.',
      );
    }
    return this.run(ctx, tool, body);
  }

  /**
   * Valida la entrada de una tool de escritura con el MISMO DTO (class-validator) que usa la
   * API REST, de modo que el camino MCP no sea una vía de escritura más débil (divisa fuera de
   * la lista, cantidades negativas, etc.). Lanza con los mensajes de validación si falla.
   */
  private async validateDto<T extends object>(
    cls: new () => T,
    input: unknown,
  ): Promise<T> {
    const dto = plainToInstance(cls, input);
    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
    if (errors.length > 0) {
      const messages = errors
        .flatMap((e) => Object.values(e.constraints ?? {}))
        .join('; ');
      throw new InvalidToolInputError(messages || 'Entrada no válida');
    }
    return dto;
  }
}

/** Error de validación de entrada de tool (se traduce a resultado de error de tool). */
class InvalidToolInputError extends Error {}

/**
 * Convierte un error (de validación o de dominio de NestJS) en un mensaje legible para el
 * host MCP. Las `HttpException` de Nest llevan el detalle en `response` (string u objeto con
 * `message`/`code`); lo extraemos sin volcar trazas internas.
 */
function toUserMessage(error: unknown): string {
  if (error instanceof InvalidToolInputError) {
    return `Entrada no válida: ${error.message}`;
  }
  const response = (error as { response?: unknown })?.response;
  if (typeof response === 'string') {
    return response;
  }
  if (response && typeof response === 'object') {
    const r = response as { message?: unknown; code?: unknown };
    const msg = Array.isArray(r.message) ? r.message.join('; ') : r.message;
    if (typeof msg === 'string') {
      return r.code ? `${msg} (${String(r.code)})` : msg;
    }
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return 'Error al ejecutar la operación';
}
